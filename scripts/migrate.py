"""
VacciTrack: миграция из Visual FoxPro → PostgreSQL

Поддерживает два отделения: KID (детское) и ADULT (взрослое).
Запуски двух баз независимы — каждый замещает только записи своего dept.
Глобальные справочники (Vaccine, MedExemptionType, RiskGroup, InsuranceCompany)
дедуплицируются по name, чтобы оба отделения шарили общие коды.

Запуск:
  pip install psycopg2-binary

  # Детское отделение
  python scripts/migrate.py --dept KID \\
    --dbf "C:/.../VACCINA детское/DB" \\
    --dsn "postgresql://vaccitrack:vaccitrack@localhost:5432/vaccitrack"

  # Взрослое отделение (можно поверх уже залитого детского — справочники
  # переиспользуются, schedule создаются с targetDept=ADULT)
  python scripts/migrate.py --dept ADULT \\
    --dbf "C:/.../VACCINA взрослое/DB" \\
    --dsn "postgresql://vaccitrack:vaccitrack@localhost:5432/vaccitrack"
"""

import struct
import sys
import argparse
import datetime
import uuid
from pathlib import Path

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("Установи: pip install psycopg2-binary")
    sys.exit(1)

# На Windows-консоли по умолчанию cp1251, ругается на любой не-русский символ
# (стрелки, эмодзи). Принудительно переводим stdout в UTF-8 с заменой
# непредставимых символов — иначе print падает посередине миграции.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')


# ————— Фиксированные UUID — для идемпотентности повторных запусков ————— #
ORG_ID = '6c8295ee-eeea-429d-aa02-b4be3a964a8d'  # совпадает с DEV_ORG_ID в apps/api/.env
SITE_ID_BY_DEPT = {
    'KID':   '0b7a7b11-1111-4111-8111-111111111111',
    'ADULT': '0b7a7b22-2222-4222-8222-222222222222',
}
SITE_NAME_BY_DEPT = {
    'KID':   'Главный корпус (детское отделение)',
    'ADULT': 'Главный корпус (взрослое отделение)',
}


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
            dec = fd[17]
            fields.append((name, ftype, length, dec))
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
            for name, ftype, length, dec in fields:
                raw = rec[offset:offset+length]
                if ftype == 'I':
                    val = struct.unpack_from('<i', raw)[0]
                elif ftype == 'L':
                    val = raw[0:1] in (b'T', b't', b'Y', b'y')
                elif ftype == 'D':
                    s2 = raw.decode('ascii', errors='replace').strip()
                    if len(s2) == 8 and s2.isdigit():
                        try:
                            val = datetime.date(int(s2[:4]), int(s2[4:6]), int(s2[6:8]))
                        except ValueError:
                            val = None
                    else:
                        val = None
                elif ftype == 'N':
                    s2 = raw.decode('ascii', errors='replace').strip()
                    try:
                        val = float(s2) if '.' in s2 else (int(s2) if s2 else None)
                    except ValueError:
                        val = None
                elif ftype == 'M':
                    val = None
                else:
                    val = raw.decode(encoding, errors='replace').strip() or None
                row[name] = val
                offset += length
            rows.append(row)
    return fields, rows


def ii(val):
    return val if isinstance(val, int) else None


def ss(val):
    if val is None:
        return None
    v = str(val).strip()
    return v if v else None


def upsert_by_name(cur, table: str, name: str, extra_cols: dict, org_scoped: bool = False) -> str:
    """Возвращает id существующей записи с таким же name (опционально в орг)
    или создаёт новую и возвращает её id."""
    where_extras = ' AND "organizationId" = %s' if org_scoped else ''
    params = [name] + ([ORG_ID] if org_scoped else [])
    cur.execute(f'SELECT id FROM "{table}" WHERE name = %s{where_extras} LIMIT 1', params)
    row = cur.fetchone()
    if row:
        return row['id']

    new_id = str(uuid.uuid4())
    columns = ['id', 'name'] + list(extra_cols.keys())
    placeholders = ['%s'] * len(columns)
    values = [new_id, name] + list(extra_cols.values())

    if table in ('Vaccine',):  # таблицы с createdAt/updatedAt
        columns += ['"createdAt"', '"updatedAt"']
        placeholders += ['NOW()', 'NOW()']

    cols_sql = ', '.join(f'"{c}"' if not c.startswith('"') else c for c in columns)
    vals_sql = ', '.join(placeholders)
    cur.execute(f'INSERT INTO "{table}" ({cols_sql}) VALUES ({vals_sql})', values)
    return new_id


def reset_dept_scope(cur, dept: str):
    """Удаляет всё, что относится к указанному отделению, в правильном FK-порядке.
    Глобальные справочники (Vaccine/MedExemptionType/RiskGroup/InsuranceCompany)
    не трогаем — они шарятся между dept."""
    site_id = SITE_ID_BY_DEPT[dept]
    print(f"   -> очистка существующих данных для dept={dept} (siteId={site_id})...")

    # 1. VaccinationRecord — пациенты этого dept
    cur.execute("""
        DELETE FROM "VaccinationRecord"
        WHERE "patientId" IN (
            SELECT p.id FROM "Patient" p
            JOIN "District" d ON d.id = p."districtId"
            WHERE d."siteId" = %s
        )
    """, (site_id,))
    rec_deleted = cur.rowcount

    # 2. Снимаем activeMedExemption у пациентов dept (FK в обе стороны)
    cur.execute("""
        UPDATE "Patient" SET "activeMedExemptionId" = NULL
        WHERE "districtId" IN (SELECT id FROM "District" WHERE "siteId" = %s)
    """, (site_id,))

    # 3. PatientMedExemption — пациентов этого dept
    cur.execute("""
        DELETE FROM "PatientMedExemption"
        WHERE "patientId" IN (
            SELECT p.id FROM "Patient" p
            JOIN "District" d ON d.id = p."districtId"
            WHERE d."siteId" = %s
        )
    """, (site_id,))

    # 4. Patient
    cur.execute("""
        DELETE FROM "Patient"
        WHERE "districtId" IN (SELECT id FROM "District" WHERE "siteId" = %s)
    """, (site_id,))
    pat_deleted = cur.rowcount

    # 5. DoctorDistrict (FK на District и Doctor)
    cur.execute("""
        DELETE FROM "DoctorDistrict"
        WHERE "districtId" IN (SELECT id FROM "District" WHERE "siteId" = %s)
           OR "doctorId" IN (SELECT id FROM "Doctor" WHERE "siteId" = %s)
    """, (site_id, site_id))

    # 6. Doctor
    cur.execute('DELETE FROM "Doctor" WHERE "siteId" = %s', (site_id,))
    doc_deleted = cur.rowcount

    # 7. District
    cur.execute('DELETE FROM "District" WHERE "siteId" = %s', (site_id,))
    dist_deleted = cur.rowcount

    # 8. VaccineScheduleLink, ссылающиеся на schedule этого dept
    cur.execute("""
        DELETE FROM "VaccineScheduleLink"
        WHERE "vaccineScheduleId" IN (
            SELECT id FROM "VaccineSchedule" WHERE "targetDept" = %s
        )
    """, (dept,))

    # 9. VaccineSchedule — обнуляем self-references parentId/nextScheduleId,
    #    потом удаляем
    cur.execute('UPDATE "VaccineSchedule" SET "parentId" = NULL, "nextScheduleId" = NULL WHERE "targetDept" = %s', (dept,))
    cur.execute('DELETE FROM "VaccineSchedule" WHERE "targetDept" = %s', (dept,))
    sched_deleted = cur.rowcount

    # 10. Site (последним — на него ссылаются всё уже удалённое)
    cur.execute('DELETE FROM "Site" WHERE id = %s', (site_id,))

    print(f"   удалено: {pat_deleted} пациентов, {rec_deleted} прививок, "
          f"{dist_deleted} участков, {doc_deleted} врачей, {sched_deleted} процедур")


def migrate(dbf_dir: str, dsn: str, dept: str):
    p = Path(dbf_dir)
    print(f"DBF:  {p}")
    print(f"DSN:  {dsn}")
    print(f"Dept: {dept}\n")

    site_id = SITE_ID_BY_DEPT[dept]
    site_name = SITE_NAME_BY_DEPT[dept]

    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    uch_map, medic_map, vaccin_map = {}, {}, {}
    motv_map, smo_map, risk_map = {}, {}, {}
    priv_map, person_map = {}, {}

    try:
        # 0. Чистка предыдущих данных этого dept (если повторный запуск)
        print(f"0/12 Очистка dept={dept}...")
        reset_dept_scope(cur, dept)

        # 1. Organization — общая, идемпотентно
        print("1/12 Organization...")
        cur.execute("""
            INSERT INTO "Organization" (id, name, "shortName", okpo, okud, "createdAt", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING
        """, (ORG_ID, 'ФБУЗ «ЛРЦ Минэкономразвития России»', 'ЛРЦ', '34580842', ''))
        print(f"   id={ORG_ID}")

        # 2. Site — отдельный для каждого dept
        print(f"2/12 Site (dept={dept})...")
        cur.execute("""
            INSERT INTO "Site" (id, "organizationId", name, dept)
            VALUES (%s, %s, %s, %s::"Dept")
        """, (site_id, ORG_ID, site_name, dept))
        print(f"   {site_id} ({site_name})")

        # 3. Districts — все из T_UCH в наш site
        print("3/12 Districts (T_UCH)...")
        _, uchs = read_dbf(str(p / 'T_UCH.dbf'))
        for row in uchs:
            uid = ii(row['ID_UCH'])
            if uid is None:
                continue
            new_id = str(uuid.uuid4())
            uch_map[uid] = new_id
            name = ss(row.get('NAME')) or f'Участок {uid}'
            full = ss(row.get('FUL_NAME')) or name
            cur.execute("""
                INSERT INTO "District" (id, "siteId", code, name)
                VALUES (%s, %s, %s, %s)
            """, (new_id, site_id, name, full))
        print(f"   {len(uch_map)} участков")

        # 4. InsuranceCompany — глобальный, дедуп по name
        print("4/12 InsuranceCompany (T_SMO)...")
        _, smos = read_dbf(str(p / 'T_SMO.dbf'))
        reused = 0
        for row in smos:
            sid = ii(row['ID_SMO'])
            if sid is None:
                continue
            name = ss(row.get('NAME')) or 'Неизвестно'
            cur.execute('SELECT id FROM "InsuranceCompany" WHERE name = %s LIMIT 1', (name,))
            existing = cur.fetchone()
            if existing:
                smo_map[sid] = existing['id']
                reused += 1
            else:
                new_id = str(uuid.uuid4())
                smo_map[sid] = new_id
                cur.execute("""
                    INSERT INTO "InsuranceCompany" (id, name, code) VALUES (%s, %s, %s)
                """, (new_id, name, ss(row.get('SNAME'))))
        print(f"   {len(smo_map)} СМО (переиспользовано: {reused})")

        # 5. RiskGroup — глобальный, дедуп по name
        print("5/12 RiskGroup (T_RISK)...")
        _, risks = read_dbf(str(p / 'T_RISK.DBF'))
        reused = 0
        for row in risks:
            rid = ii(row['ID_RISK'])
            if rid is None:
                continue
            name = ss(row.get('FUL_NAME')) or ss(row.get('NAME')) or 'Без группы'
            cur.execute('SELECT id FROM "RiskGroup" WHERE name = %s LIMIT 1', (name,))
            existing = cur.fetchone()
            if existing:
                risk_map[rid] = existing['id']
                reused += 1
            else:
                new_id = str(uuid.uuid4())
                risk_map[rid] = new_id
                cur.execute('INSERT INTO "RiskGroup" (id, name) VALUES (%s, %s)', (new_id, name))
        print(f"   {len(risk_map)} групп риска (переиспользовано: {reused})")

        # 6. MedExemptionType — глобальный, дедуп по name
        print("6/12 MedExemptionType (T_MOTV)...")
        _, motvs = read_dbf(str(p / 'T_MOTV.dbf'))
        reused = 0
        for row in motvs:
            mid = ii(row['ID_MOTV'])
            if mid is None:
                continue
            name = ss(row.get('NAME')) or 'Без названия'
            cur.execute('SELECT id FROM "MedExemptionType" WHERE name = %s LIMIT 1', (name,))
            existing = cur.fetchone()
            if existing:
                motv_map[mid] = existing['id']
                reused += 1
            else:
                new_id = str(uuid.uuid4())
                motv_map[mid] = new_id
                cur.execute("""
                    INSERT INTO "MedExemptionType" (id, name, "isSystem") VALUES (%s, %s, %s)
                """, (new_id, name, bool(row.get('L_CONST'))))
        print(f"   {len(motv_map)} типов медотвода (переиспользовано: {reused})")

        # 7. Vaccine — общая на org, дедуп по name
        print("7/12 Vaccine (T_VACCIN)...")
        _, vaccins = read_dbf(str(p / 'T_VACCIN.dbf'))
        reused = 0
        for row in vaccins:
            vid = ii(row['ID_VACCIN'])
            if vid is None:
                continue
            name = ss(row.get('NAME')) or 'Неизвестно'
            cur.execute(
                'SELECT id FROM "Vaccine" WHERE name = %s AND "organizationId" = %s LIMIT 1',
                (name, ORG_ID),
            )
            existing = cur.fetchone()
            if existing:
                vaccin_map[vid] = existing['id']
                reused += 1
                continue
            new_id = str(uuid.uuid4())
            vaccin_map[vid] = new_id
            dose = row.get('DOZA')
            cur.execute("""
                INSERT INTO "Vaccine" (id, "organizationId", name, "tradeName", producer, country, "dosesMl", "createdAt", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
            """, (new_id, ORG_ID, name, ss(row.get('NZNAME')),
                  ss(row.get('FIRM')), ss(row.get('LAND')),
                  float(dose) if dose else None))
        print(f"   {len(vaccin_map)} вакцин (переиспользовано: {reused})")

        # 8. VaccineSchedule — отдельные для каждого dept (targetDept=KID|ADULT)
        print(f"8/12 VaccineSchedule (T_PRIV) → targetDept={dept}...")
        _, privs = read_dbf(str(p / 'T_PRIV.dbf'))
        priv_rows = {}
        for row in privs:
            pid = ii(row['ID_PRIV'])
            if pid is None:
                continue
            new_id = str(uuid.uuid4())
            priv_map[pid] = new_id
            priv_rows[pid] = row
            kod1 = ii(row.get('KOD1')) or 0
            kod2 = ii(row.get('KOD2')) or 0
            cur.execute("""
                INSERT INTO "VaccineSchedule" (
                    id, code, key, name, "shortName", "isActive", "isEpid", "targetDept",
                    "minAgeYears", "minAgeMonths", "minAgeDays",
                    "maxAgeYears", "maxAgeMonths", "maxAgeDays",
                    "intervalDays", "intervalMonths", "intervalYears",
                    "medExemptionLimitDays", "medExemptionLimitMonths", "medExemptionLimitYears"
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s::"ScheduleScope",%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (
                new_id, f"{kod1}_{kod2}", ss(row.get('KEY_')),
                ss(row.get('NAME')) or f"{kod1}_{kod2}", ss(row.get('SNAME')),
                bool(row.get('L_PRIV', True)), False, dept,
                row.get('MIN_GG') or 0, row.get('MIN_MM') or 0, row.get('MIN_DD') or 0,
                row.get('MAX_GG') or 99, row.get('MAX_MM') or 0, row.get('MAX_DD') or 0,
                row.get('DD') or 0, row.get('MM') or 0, row.get('GG') or 0,
                row.get('LIM_DD') or 0, row.get('LIM_MM') or 0, row.get('LIM_GG') or 0,
            ))

        # parentId / nextScheduleId по KEY_
        priv_by_key: dict = {}
        for pid, row in priv_rows.items():
            k = ss(row.get('KEY_'))
            if k:
                priv_by_key[k] = priv_map[pid]
        for pid, row in priv_rows.items():
            my_id = priv_map[pid]
            parent_key = ss(row.get('PARENT'))
            next_id_raw = ii(row.get('ID_NEXT'))
            parent_new = priv_by_key.get(parent_key) if parent_key else None
            next_new = priv_map.get(next_id_raw) if next_id_raw else None
            if parent_new or next_new:
                cur.execute(
                    'UPDATE "VaccineSchedule" SET "parentId"=%s, "nextScheduleId"=%s WHERE id=%s',
                    (parent_new, next_new, my_id),
                )
        print(f"   {len(priv_map)} позиций нацкалендаря")

        # 9. VaccineScheduleLink — связи vaccine↔schedule
        print("9/12 VaccineScheduleLink (T_VAC_PR)...")
        _, vacprs = read_dbf(str(p / 'T_VAC_PR.dbf'))
        links = 0
        for row in vacprs:
            v_new = vaccin_map.get(ii(row['ID_VACCIN']))
            p_new = priv_map.get(ii(row['ID_PRIV']))
            if v_new and p_new:
                cur.execute("""
                    INSERT INTO "VaccineScheduleLink" ("vaccineId","vaccineScheduleId")
                    VALUES (%s,%s) ON CONFLICT DO NOTHING
                """, (v_new, p_new))
                links += 1
        print(f"   {links} связей")

        # 10. Doctor — в site текущего dept
        print("10/12 Doctor (T_MEDIC)...")
        _, medics = read_dbf(str(p / 'T_MEDIC.dbf'))
        for row in medics:
            mid = ii(row['ID_MEDIC'])
            family = ss(row.get('FAMILY'))
            if mid is None or not family or family == 'Нет':
                continue
            new_id = str(uuid.uuid4())
            medic_map[mid] = new_id
            cur.execute("""
                INSERT INTO "Doctor" (id, "siteId", "lastName", "firstName", "middleName")
                VALUES (%s, %s, %s, %s, %s)
            """, (new_id, site_id, family, ss(row.get('NAME')) or '—', ss(row.get('PNAME'))))
        print(f"   {len(medic_map)} врачей")

        # 11. Patient — в district текущего dept
        print("11/12 Patient (T_PERSON)...")
        _, persons = read_dbf(str(p / 'T_PERSON.dbf'))
        patient_count = 0
        for row in persons:
            pid = ii(row['ID_PERS'])
            family = ss(row.get('FAMILY'))
            if pid is None or not family:
                continue
            new_id = str(uuid.uuid4())
            person_map[pid] = new_id
            sex_raw = ii(row.get('SEX'))
            sex = 'MALE' if sex_raw == 1 else 'FEMALE'
            birthday = row.get('BIRTHDAY')
            if not isinstance(birthday, datetime.date):
                birthday = datetime.date(1900, 1, 1)
            cur.execute("""
                INSERT INTO "Patient" (
                    id, "organizationId", "districtId", "insuranceId", "riskGroupId",
                    "lastName", "firstName", "middleName", sex, birthday,
                    "cityName", "streetName", house, apartment, phone,
                    "policySerial", "policyNumber",
                    "hasDirectContract", "directContractNumber",
                    "isResident", "isAlive", "isDecret", "isGkdc", "isSelfOrganized",
                    "createdAt", "updatedAt"
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::"Sex",%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NOW())
            """, (
                new_id, ORG_ID,
                uch_map.get(ii(row.get('ID_UCH'))),
                smo_map.get(ii(row.get('ID_SMO'))),
                risk_map.get(ii(row.get('ID_RISK'))),
                family, ss(row.get('NAME')) or '—', ss(row.get('PNAME')),
                sex, birthday,
                ss(row.get('GOROD')), ss(row.get('STREET')),
                ss(row.get('NDOMA')), ss(row.get('NKV')), ss(row.get('PHONE')),
                ss(row.get('POLIS_S')), ss(row.get('POLIS_N')),
                False, None,                                  # hasDirectContract / directContractNumber
                bool(row.get('RESIDENT', True)), bool(row.get('LIVE', True)),
                bool(row.get('DEKRET', False)), bool(row.get('GKDC', False)),
                False,                                        # isSelfOrganized — заполняется вручную
            ))
            # Медотвод из T_PERSON → PatientMedExemption
            motv_id_raw = ii(row.get('ID_MOTV'))
            dt1 = row.get('DT1_MOTV')
            dt2 = row.get('DT2_MOTV')
            if motv_id_raw and motv_id_raw != 0 and motv_id_raw in motv_map:
                exempt_id = str(uuid.uuid4())
                date_from = dt1 if isinstance(dt1, datetime.date) else datetime.date.today()
                date_to = dt2 if isinstance(dt2, datetime.date) else None
                cur.execute("""
                    INSERT INTO "PatientMedExemption"
                        (id, "patientId", "medExemptionTypeId", "dateFrom", "dateTo")
                    VALUES (%s,%s,%s,%s,%s)
                """, (exempt_id, new_id, motv_map[motv_id_raw], date_from, date_to))
                cur.execute('UPDATE "Patient" SET "activeMedExemptionId"=%s WHERE id=%s',
                            (exempt_id, new_id))
            patient_count += 1
        print(f"   {patient_count} пациентов")

        # 12. VaccinationRecord — все T_NOZ1..T_NOZ18 (одинаковая структура 185)
        print("12/12 VaccinationRecord (T_NOZ1..T_NOZ18)...")
        noz_files = ['T_NOZ1.dbf', 'T_NOZ2.dbf', 'T_NOZ3.dbf', 'T_NOZ4.dbf', 'T_NOZ5.dbf',
                     'T_NOZ6.dbf', 'T_NOZ7.dbf', 'T_NOZ8.dbf', 'T_NOZ9.dbf', 'T_NOZ10.dbf',
                     'T_NOZ11.dbf', 'T_NOZ12.dbf', 'T_NOZ13.dbf', 'T_NOZ14.dbf', 'T_NOZ18.dbf']
        rec_count = 0
        skipped_patient = 0
        skipped_date = 0
        per_file: dict = {}
        for fname in noz_files:
            fpath = p / fname
            if not fpath.exists():
                continue
            _, rows = read_dbf(str(fpath))
            file_count = 0
            for row in rows:
                patient_new = person_map.get(ii(row.get('ID_PERS')))
                if not patient_new:
                    skipped_patient += 1
                    continue
                vac_date = row.get('DT_PRIV')
                if not isinstance(vac_date, datetime.date):
                    skipped_date += 1
                    continue
                cur.execute("""
                    INSERT INTO "VaccinationRecord" (
                        id, "patientId", "vaccineScheduleId", "vaccineId", "doctorId",
                        "isEpid", "isExternal", "ageYears", "ageMonths", "ageDays",
                        "vaccinationDate", "doseNumber", series, "checkNumber", result,
                        "medExemptionTypeId", "medExemptionDate", "nextScheduledDate",
                        "createdAt", "updatedAt"
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NOW())
                """, (
                    str(uuid.uuid4()), patient_new,
                    priv_map.get(ii(row.get('ID_PRIV'))),
                    vaccin_map.get(ii(row.get('ID_VACCIN'))),
                    medic_map.get(ii(row.get('ID_DOCTOR'))),
                    bool(row.get('L_EPID', False)), bool(row.get('L_EXTR', False)),
                    int(row.get('GG') or 0), int(row.get('MM') or 0), int(row.get('DD') or 0),
                    vac_date,
                    float(row['PRV_DOZA']) if row.get('PRV_DOZA') else None,
                    ss(row.get('PRV_SER')), ss(row.get('CHECKN')),
                    ss(row.get('REZ_MED')) or ss(row.get('MARK')),
                    motv_map.get(ii(row.get('ID_MOTV'))) if ii(row.get('ID_MOTV')) else None,
                    row.get('DT_MOTV') if isinstance(row.get('DT_MOTV'), datetime.date) else None,
                    row.get('DT_NEXT') if isinstance(row.get('DT_NEXT'), datetime.date) else None,
                ))
                rec_count += 1
                file_count += 1
            per_file[fname] = file_count
        print(f"   {rec_count} записей вакцинации (пропущено: "
              f"{skipped_patient} без пациента, {skipped_date} без даты)")
        for fn, c in per_file.items():
            print(f"     {fn}: {c}")

        conn.commit()
        print(f"\n[OK] Миграция dept={dept} завершена!")
        print(f"   Пациентов: {patient_count} | Вакцинаций: {rec_count}")
        print(f"   Вакцин: {len(vaccin_map)} | Нацкалендарь: {len(priv_map)} поз.")

    except Exception as e:
        conn.rollback()
        print(f"\n[ERROR] Ошибка: {e}")
        import traceback
        traceback.print_exc()
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dbf', required=True, help='Папка с DBF (например, .../VACCINA взрослое/DB)')
    parser.add_argument('--dsn', required=True, help='postgresql://user:pass@host:port/db')
    parser.add_argument('--dept', choices=['KID', 'ADULT'], default='KID',
                        help='Отделение (KID/ADULT). По умолчанию KID.')
    args = parser.parse_args()
    migrate(args.dbf, args.dsn, args.dept)
