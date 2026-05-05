"""Сравнение структуры DBF в двух базах FoxPro.

Выводит для каждой таблицы: количество записей + diff полей (добавлены / удалены / изменились).
"""
import struct
import sys
from pathlib import Path


def read_header(path: Path):
    with open(path, 'rb') as f:
        header = f.read(32)
        num_records = struct.unpack_from('<I', header, 4)[0]
        record_size = struct.unpack_from('<H', header, 10)[0]
        fields = []
        f.seek(32)
        while True:
            fd = f.read(32)
            if not fd or fd[0] == 0x0D:
                break
            name = fd[:11].replace(b'\x00', b'').decode('cp866', errors='replace').strip()
            ftype = chr(fd[11])
            length = fd[16]
            fields.append((name, ftype, length))
    return num_records, record_size, fields


def main(a_dir: str, b_dir: str):
    a = Path(a_dir)
    b = Path(b_dir)
    a_files = {f.name.lower() for f in a.iterdir() if f.suffix.lower() == '.dbf'}
    b_files = {f.name.lower() for f in b.iterdir() if f.suffix.lower() == '.dbf'}
    common = sorted(a_files & b_files)

    # Показываем самые интересные: T_*, tallnoz, tallpers.
    keep_prefixes = ('t_', 'tall', 'tperson', 'tpriv', 'tvaccin', 'tmotv')
    priority = [f for f in common if any(f.startswith(p) for p in keep_prefixes)]

    print(f"{'Файл':<20} {'детское':>12} {'взрослое':>12}  структура")
    print('-' * 120)
    for fname in priority:
        try:
            a_rec, a_rs, a_fields = read_header(a / fname)
        except Exception as e:
            print(f"{fname:<20} ERROR (детское): {e}")
            continue
        try:
            b_rec, b_rs, b_fields = read_header(b / fname)
        except Exception as e:
            print(f"{fname:<20} ERROR (взрослое): {e}")
            continue

        a_f = {n: (t, l) for n, t, l in a_fields}
        b_f = {n: (t, l) for n, t, l in b_fields}
        added = sorted(set(b_f) - set(a_f))
        removed = sorted(set(a_f) - set(b_f))
        changed = sorted(
            n for n in set(a_f) & set(b_f)
            if a_f[n] != b_f[n]
        )

        struct_info: list[str] = []
        if a_rs != b_rs:
            struct_info.append(f"recsz {a_rs}→{b_rs}")
        if added:
            struct_info.append(f"+{','.join(added)}")
        if removed:
            struct_info.append(f"-{','.join(removed)}")
        if changed:
            struct_info.append(f"~{','.join(f'{n}({a_f[n]}→{b_f[n]})' for n in changed)}")
        if not struct_info:
            struct_info = ['идентично']
        print(f"{fname:<20} {a_rec:>12} {b_rec:>12}  {'; '.join(struct_info)}")

    # Файлы которые есть только в одной
    only_a = a_files - b_files
    only_b = b_files - a_files
    if only_a:
        print(f"\nТолько в детском: {sorted(only_a)}")
    if only_b:
        print(f"Только во взрослом: {sorted(only_b)}")


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
