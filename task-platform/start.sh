#!/bin/sh
set -eu
: "${DATABASE_URL:?Set Supabase DATABASE_URL in Render Environment}"
: "${SECRET_KEY:?Set SECRET_KEY in Render Environment}"
: "${PORT:=10000}"
python -m flask --app app init-db
python -m flask --app app bootstrap-admin
exec waitress-serve --host=0.0.0.0 --port="${PORT}" app:app
