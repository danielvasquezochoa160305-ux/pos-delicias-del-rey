#!/bin/bash
# Respaldo diario de la base de datos del POS.
# Usa el comando .backup de SQLite para una copia consistente (seguro con WAL).
set -e
APP_DIR=/opt/pos-cafeteria
BACKUP_DIR="$APP_DIR/backups"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)

sqlite3 "$APP_DIR/pos.db" ".backup '$BACKUP_DIR/pos_$STAMP.db'"

# Conservar solo los últimos 30 respaldos
ls -1t "$BACKUP_DIR"/pos_*.db 2>/dev/null | tail -n +31 | xargs -r rm -f

echo "[$(date)] Respaldo creado: pos_$STAMP.db"
