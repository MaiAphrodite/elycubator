package main

import _ "embed"

//go:embed db/schema.sql
var schemaSQL string
