"""Быстрый диагностический скрипт: сколько записей в T_NOZ*, общее и активных."""
import struct
import sys
from pathlib import Path


def count_dbf(path: Path):
    with open(path, 'rb') as f:
        header = f.read(32)
        num_records = struct.unpack_from('<I', header, 4)[0]
        header_size = struct.unpack_from('<H', header, 8)[0]
        record_size = struct.unpack_from('<H', header, 10)[0]
        fields = []
        f.seek(32)
        while True:
            fd = f.read(32)
            if not fd or fd[0] == 0x0D:
                break
            name = fd[:11].replace(b'\x00', b'').decode('cp866', errors='replace')
            fields.append(name)
        f.seek(header_size)
        active = 0
        deleted = 0
        for _ in range(num_records):
            rec = f.read(record_size)
            if not rec or len(rec) < record_size:
                break
            if rec[0] == 0x2A:
                deleted += 1
            else:
                active += 1
    return num_records, active, deleted, record_size, fields


def main(root: str):
    p = Path(root)
    files = sorted([f for f in p.iterdir() if f.suffix.lower() == '.dbf' and 'noz' in f.name.lower()])
    print(f"{'Файл':<20} {'заявл':>8} {'актив':>8} {'удал':>8} {'recsz':>6}  поля")
    print('-' * 130)
    for f in files:
        try:
            declared, active, deleted, rs, fields = count_dbf(f)
            name = f.name
            field_preview = ', '.join(fields[:10]) + (' ...' if len(fields) > 10 else '')
            print(f"{name:<20} {declared:>8} {active:>8} {deleted:>8} {rs:>6}  {field_preview}")
        except Exception as e:
            print(f"{f.name:<20} ERROR: {e}")


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
