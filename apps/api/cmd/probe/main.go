// Throwaway dev probe. Runs read-only diagnostic queries against the
// DATABASE_URL_DIRECT connection and prints results. Not wired into builds.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

const probeTimeout = 10 * time.Second

type probeQuery struct {
	label string
	sql   string
}

func main() {
	if err := run(); err != nil {
		slog.Error("probe failed", "err", err)
		os.Exit(1)
	}
}

func run() error {
	_ = godotenv.Load("../../.env", "../.env", ".env")

	url := os.Getenv("DATABASE_URL_DIRECT")
	if url == "" {
		return fmt.Errorf("DATABASE_URL_DIRECT is empty")
	}

	ctx, cancel := context.WithTimeout(context.Background(), probeTimeout)
	defer cancel()

	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer conn.Close(ctx)

	queries := []probeQuery{
		{"auth-related schemas", `SELECT nspname FROM pg_namespace WHERE nspname LIKE '%auth%' OR nspname IN ('neon_auth','better_auth') ORDER BY nspname`},
		{"tables in neon_auth", `SELECT table_name FROM information_schema.tables WHERE table_schema='neon_auth' ORDER BY table_name`},
		{"views in neon_auth", `SELECT table_name FROM information_schema.views WHERE table_schema='neon_auth' ORDER BY table_name`},
	}

	for _, q := range queries {
		items, err := selectStrings(ctx, conn, q.sql)
		if err != nil {
			return fmt.Errorf("%s: %w", q.label, err)
		}
		if len(items) == 0 {
			fmt.Printf("%-22s (none)\n", q.label)
			continue
		}
		fmt.Printf("%-22s %s\n", q.label, strings.Join(items, ", "))
	}
	return nil
}

func selectStrings(ctx context.Context, conn *pgx.Conn, sql string) ([]string, error) {
	rows, err := conn.Query(ctx, sql)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer rows.Close()

	var items []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		items = append(items, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate: %w", err)
	}
	return items, nil
}
