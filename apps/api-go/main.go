package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	sqlc "elycubator/db/sqlc"
)

var (
	queries *sqlc.Queries
	dbConn  *sql.DB
)

func main() {
	if err := validateConfig(); err != nil {
		log.Fatalf("config: %v", err)
	}

	conn, err := openDB(dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	dbConn = conn
	defer dbConn.Close()

	if err := applySchema(dbConn); err != nil {
		log.Fatalf("schema: %v", err)
	}
	queries = sqlc.New(dbConn)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	startTelemetryRetention(ctx)

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           newRouter(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    64 << 10,
	}

	go func() {
		log.Printf("elycubator env:%s addr::%s web:%s db:%s", appEnv, port, webDist, dbPath)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-ctx.Done()
	stop()
	log.Printf("shutdown requested, draining connections")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}

func openDB(path string) (*sql.DB, error) {
	conn, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)&_journal_mode=WAL")
	if err != nil {
		return nil, err
	}
	conn.SetMaxOpenConns(1)
	return conn, nil
}

func applySchema(conn *sql.DB) error {
	for _, stmt := range strings.Split(schemaSQL, ";") {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}
		if _, err := conn.Exec(stmt); err != nil {
			return fmt.Errorf("%s: %w", strings.SplitN(stmt, "\n", 2)[0], err)
		}
	}
	return nil
}

func newRouter() http.Handler {
	mux := http.NewServeMux()
	registerAuth(mux)
	registerDevice(mux)
	registerTelemetry(mux)
	registerIncubation(mux)
	registerWS(mux)
	registerAPIPhp(mux)
	mux.HandleFunc("GET /api/health", hHealth)
	mux.Handle("/", spaHandler(webDist))
	return securityHeaders(corsWrap(limitBody(rateLimitWrap(mux))))
}

func hHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := dbConn.PingContext(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]interface{}{"success": false, "error": "database unavailable"})
		return
	}
	ok(w, map[string]interface{}{"status": "ok"})
}

func startTelemetryRetention(ctx context.Context) {
	days, err := strconv.Atoi(telemetryRetention)
	if err != nil || days <= 0 {
		log.Printf("telemetry retention disabled")
		return
	}
	go func() {
		prune := func() {
			res, err := dbConn.ExecContext(ctx, "DELETE FROM telemetry WHERE timestamp < datetime('now', ?)", fmt.Sprintf("-%d days", days))
			if err != nil {
				log.Printf("telemetry prune failed: %v", err)
				return
			}
			if n, err := res.RowsAffected(); err == nil && n > 0 {
				log.Printf("telemetry pruned: %d rows older than %d days", n, days)
				dbConn.ExecContext(ctx, "PRAGMA wal_checkpoint(TRUNCATE)")
			}
		}
		prune()
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				prune()
			}
		}
	}()
}

func spaHandler(dir string) http.Handler {
	files := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api.php" {
			http.NotFound(w, r)
			return
		}
		target := filepath.Join(dir, filepath.Clean("/"+r.URL.Path))
		if info, err := os.Stat(target); err == nil && !info.IsDir() {
			files.ServeHTTP(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(dir, "index.html"))
	})
}
