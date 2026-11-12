#!/bin/sh
set -eu
: "${DATABASE_PATH:?Set DATABASE_PATH on a mounted persistent disk}"
: "${SECRET_KEY:?Set SECRET_KEY in Render environment}"
: "${PORT:=10000}"
python -m flask --app app init-db
exec waitress-serve --host=0.0.0.0 --port="${PORT}" app:app
