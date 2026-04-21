"""Показывает все поля T_PRIV и пример строк, плюс распределение ID_PRIV по T_NOZ_N."""
import struct
import sys
from pathlib import Path


def read_dbf(path: str, encoding='cp1251'):
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
            ftype = chr(fd[11])
            length = fd[16]
            fields.append((name, ftype, length))
        f.seek(header_size)
        rows = []
        for _ in range(num_records):
            rec = f.read(record_size)
            if not rec or len(rec) < record_size:
                break
            if rec[0] == 0x2A:
                continue
            row = {}
            offset = 1
            for name, ftype, length in fields:
                raw = rec[offset:offset+length]
                if ftype == 'I':
                    val = struct.unpack_from('<i', raw)[0]
                elif ftype == 'L':
                    val = raw[0:1] in (b'T', b't', b'Y', b'y')
                elif ftype == 'N':
                    s2 = raw.decode('ascii', errors='replace').strip()
                    try:
                        val = float(s2) if '.' in s2 else (int(s2) if s2 else None)
                    except ValueError:
                        val = None
                else:
                    val = raw.decode(encoding, errors='replace').strip() or None
                row[name] = val
                offset += length
            rows.append(row)
        return fields, rows


def main(root: str):
    p = Path(root)

    # 1. T_PRIV: все поля и первые 10 строк
    fields, rows = read_dbf(str(p / 't_priv.dbf'))
    print('=== T_PRIV fields ===')
    for name, ftype, length in fields:
        print(f'  {name:<12} {ftype} ({length})')
    print(f'\n=== T_PRIV sample (5 rows) ===')
    for r in rows[:5]:
        print({k: r[k] for k in ('ID_PRIV', 'KOD1', 'KOD2', 'NAME', 'SNAME', 'KEY_', 'PARENT') if k in r})

    # 2. Уникальные KOD1 + имена
    print(f'\n=== KOD1 distribution (unique) ===')
    by_kod1: dict = {}
    for r in rows:
        kod1 = r.get('KOD1')
        if kod1 is None:
            continue
        by_kod1.setdefault(kod1, []).append(r.get('NAME') or '')
    for k in sorted(by_kod1.keys(), key=lambda x: (x is None, x)):
        names = sorted(set(by_kod1[k]))
        sample = '; '.join(names[:3])
        print(f'  KOD1={k!s:<4} ({len(by_kod1[k])} строк) → {sample}')

    # 3. Для каждого T_NOZ_N: какие ID_PRIV там встречаются и к каким KOD1 они относятся
    priv_to_kod1 = {r['ID_PRIV']: r.get('KOD1') for r in rows if r.get('ID_PRIV') is not None}
    priv_to_name = {r['ID_PRIV']: (r.get('NAME') or '') for r in rows if r.get('ID_PRIV') is not None}

    print(f'\n=== T_NOZ_N → KOD1 распределение ===')
    noz_files = [f'T_NOZ{i}.dbf' for i in [1,2,3,4,5,6,7,8,9,10,11,12,13,14,18]]
    for fn in noz_files:
        fp = p / fn
        if not fp.exists():
            continue
        _, recs = read_dbf(str(fp))
        kod1s: dict = {}
        for r in recs:
            pid = r.get('ID_PRIV')
            k1 = priv_to_kod1.get(pid)
            kod1s[k1] = kod1s.get(k1, 0) + 1
        # Top 3 kod1
        top = sorted(kod1s.items(), key=lambda x: -x[1])[:3]
        top_str = ', '.join(f'KOD1={k}:{c}' for k, c in top)
        # Sample names for top KOD1
        main_kod1 = top[0][0] if top else None
        sample_names = sorted(set(priv_to_name[pid] for pid in priv_to_name
                                   if priv_to_kod1.get(pid) == main_kod1))[:3]
        print(f'  {fn:<12} {len(recs):>5} зап.  {top_str}  →  {"; ".join(sample_names)}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
