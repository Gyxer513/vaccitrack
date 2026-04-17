"""
VacciTrack: миграция из Visual FoxPro → PostgreSQL

Запуск:
  pip install psycopg2-binary
  python scripts/migrate.py \
    --dbf "C:/Users/fpanc/Desktop/Projects/VACCINA детское/DB" \
    --dsn "postgresql://vaccitrack:vaccitrack@localhost:5432/vaccitrack"
"""

import struct, sys, argparse, datetime, uuid
from pathlib import Path

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("Установи: pip install psycopg2-binary")
    sys.exit(1)


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


def migrate(dbf_dir: str, dsn: str):
    p = Path(dbf_dir)
    print(f"DBF: {p}")
    print(f"DSN: {dsn}\n")

    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    org_id = str(uuid.uuid4())
    site_id = str(uuid.uuid4())
    uch_map, medic_map, vaccin_map = {}, {}, {}
    motv_map, smo_map, risk_map = {}, {}, {}
    priv_map, person_map = {}, {}

    try:
        # 1. Organization (есть createdAt/updatedAt)
        print("1/12 Organization...")
        cur.execute("""
            INSERT INTO "Organization" (id, name, "shortName", okpo, okud, "createdAt", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, NOW(), NOW()) ON CONFLICT DO NOTHING
        """, (org_id, 'ФБУЗ «ЛРЦ Минэкономразвития России»', 'ЛРЦ', '34580842', ''))
        print(f"   id={org_id}")

        # 2. Site (нет createdAt/updatedAt)
        print("2/12 Site...")
        cur.execute("""
            INSERT INTO "Site" (id, "organizationId", name)
            VALUES (%s, %s, %s) ON CONFLICT DO NOTHING
        """, (site_id, org_id, 'Главный корпус'))

        # 3. Districts (нет createdAt/updatedAt)
        print("3/12 Districts (T_UCH)...")
        _, uchs = read_dbf(str(p / 'T_UCH.dbf'))
        for row in uchs:
            uid = ii(row['ID_UCH'])
            if uid is None: continue
            new_id = str(uuid.uuid4())
            uch_map[uid] = new_id
            name = ss(row.get('NAME')) or f'Участок {uid}'
            full = ss(row.get('FUL_NAME')) or name
            cur.execute("""
                INSERT INTO "District" (id, "siteId", code, name)
                VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING
            """, (new_id, site_id, name, full))
        print(f"   {len(uch_map)} участков")

        # 4. InsuranceCompany (нет createdAt/updatedAt)
        print("4/12 InsuranceCompany (T_SMO)...")
        _, smos = read_dbf(str(p / 'T_SMO.dbf'))
        for row in smos:
            sid = ii(row['ID_SMO'])
            if sid is None: continue
            new_id = str(uuid.uuid4())
            smo_map[sid] = new_id
            cur.execute("""
                INSERT INTO "InsuranceCompany" (id, name, code)
                VALUES (%s, %s, %s) ON CONFLICT DO NOTHING
            """, (new_id, ss(row.get('NAME')) or 'Неизвестно', ss(row.get('SNAME'))))
        print(f"   {len(smo_map)} СМО")

        # 5. RiskGroup (нет createdAt/updatedAt)
        print("5/12 RiskGroup (T_RISK)...")
        _, risks = read_dbf(str(p / 'T_RISK.DBF'))
        for row in risks:
            rid = ii(row['ID_RISK'])
            if rid is None: continue
            new_id = str(uuid.uuid4())
            risk_map[rid] = new_id
            cur.execute("""
                INSERT INTO "RiskGroup" (id, name)
                VALUES (%s, %s) ON CONFLICT DO NOTHING
            """, (new_id, ss(row.get('FUL_NAME')) or ss(row.get('NAME')) or 'Без группы'))
        print(f"   {len(risk_map)} групп риска")

        # 6. MedExemptionType (нет createdAt/updatedAt)
        print("6/12 MedExemptionType (T_MOTV)...")
        _, motvs = read_dbf(str(p / 'T_MOTV.dbf'))
        for row in motvs:
            mid = ii(row['ID_MOTV'])
            if mid is None: continue
            new_id = str(uuid.uuid4())
            motv_map[mid] = new_id
            cur.execute("""
                INSERT INTO "MedExemptionType" (id, name, "isSystem")
                VALUES (%s, %s, %s) ON CONFLICT DO NOTHING
            """, (new_id, ss(row.get('NAME')) or 'Без названия', bool(row.get('L_CONST'))))
        print(f"   {len(motv_map)} типов медотвода")

        # 7. Vaccine (есть createdAt/updatedAt)
        print("7/12 Vaccine (T_VACCIN)...")
        _, vaccins = read_dbf(str(p / 'T_VACCIN.dbf'))
        for row in vaccins:
            vid = ii(row['ID_VACCIN'])
            if vid is None: continue
            new_id = str(uuid.uuid4())
            vaccin_map[vid] = new_id
            dose = row.get('DOZA')
            cur.execute("""
                INSERT INTO "Vaccine" (id, "organizationId", name, "tradeName", producer, country, "dosesMl", "createdAt", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW()) ON CONFLICT DO NOTHING
            """, (new_id, org_id,
                  ss(row.get('NAME')) or 'Неизвестно', ss(row.get('NZNAME')),
                  ss(row.get('FIRM')), ss(row.get('LAND')),
                  float(dose) if dose else None))
        print(f"   {len(vaccin_map)} вакцин")

        # 8. VaccineSchedule (нет createdAt/updatedAt)
        print("8/12 VaccineSchedule (T_PRIV)...")
        _, privs = read_dbf(str(p / 'T_PRIV.dbf'))
        priv_rows = {}
        for row in privs:
            pid = ii(row['ID_PRIV'])
            if pid is None: continue
            new_id = str(uuid.uuid4())
            priv_map[pid] = new_id
            priv_rows[pid] = row
            kod1 = ii(row.get('KOD1')) or 0
            kod2 = ii(row.get('KOD2')) or 0
            cur.execute("""
                INSERT INTO "VaccineSchedule" (
                    id, code, key, name, "shortName", "isActive", "isEpid",
                    "minAgeYears", "minAgeMonths", "minAgeDays",
                    "maxAgeYears", "maxAgeMonths", "maxAgeDays",
                    "intervalDays", "intervalMonths", "intervalYears",
                    "medExemptionLimitDays", "medExemptionLimitMonths", "medExemptionLimitYears"
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT DO NOTHING
            """, (
                new_id, f"{kod1}_{kod2}", ss(row.get('KEY_')),
                ss(row.get('NAME')) or f"{kod1}_{kod2}", ss(row.get('SNAME')),
                bool(row.get('L_PRIV', True)), False,
                row.get('MIN_GG') or 0, row.get('MIN_MM') or 0, row.get('MIN_DD') or 0,
                row.get('MAX_GG') or 99, row.get('MAX_MM') or 0, row.get('MAX_DD') or 0,
                row.get('DD') or 0, row.get('MM') or 0, row.get('GG') or 0,
                row.get('LIM_DD') or 0, row.get('LIM_MM') or 0, row.get('LIM_GG') or 0,
            ))
        # второй проход — parentId / nextScheduleId
        for pid, row in priv_rows.items():
            my_id = priv_map[pid]
            parent_raw = ss(row.get('PARENT'))
            next_id_raw = ii(row.get('ID_NEXT'))
            parent_priv_id = int(parent_raw.rstrip('_')) if parent_raw and parent_raw.rstrip('_').isdigit() else None
            parent_new = priv_map.get(parent_priv_id) if parent_priv_id else None
            next_new = priv_map.get(next_id_raw) if next_id_raw else None
            if parent_new or next_new:
                cur.execute('UPDATE "VaccineSchedule" SET "parentId"=%s,"nextScheduleId"=%s WHERE id=%s',
                            (parent_new, next_new, my_id))
        print(f"   {len(priv_map)} позиций нацкалендаря")

        # 9. VaccineScheduleLink (нет createdAt/updatedAt)
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

        # 10. Doctor (нет createdAt/updatedAt)
        print("10/12 Doctor (T_MEDIC)...")
        _, medics = read_dbf(str(p / 'T_MEDIC.dbf'))
        for row in medics:
            mid = ii(row['ID_MEDIC'])
            family = ss(row.get('FAMILY'))
            if mid is None or not family or family == 'Нет': continue
            new_id = str(uuid.uuid4())
            medic_map[mid] = new_id
            cur.execute("""
                INSERT INTO "Doctor" (id, "siteId", "lastName", "firstName", "middleName")
                VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING
            """, (new_id, site_id, family, ss(row.get('NAME')) or '—', ss(row.get('PNAME'))))
        print(f"   {len(medic_map)} врачей")

        # 11. Patient (есть createdAt/updatedAt)
        print("11/12 Patient (T_PERSON)...")
        _, persons = read_dbf(str(p / 'T_PERSON.dbf'))
        patient_count = 0
        for row in persons:
            pid = ii(row['ID_PERS'])
            family = ss(row.get('FAMILY'))
            if pid is None or not family: continue
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
                    "isResident", "isAlive", "isDecret", "isGkdc",
                    "createdAt", "updatedAt"
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NOW())
                ON CONFLICT DO NOTHING
            """, (
                new_id, org_id,
                uch_map.get(ii(row.get('ID_UCH'))),
                smo_map.get(ii(row.get('ID_SMO'))),
                risk_map.get(ii(row.get('ID_RISK'))),
                family, ss(row.get('NAME')) or '—', ss(row.get('PNAME')),
                sex, birthday,
                ss(row.get('GOROD')), ss(row.get('STREET')),
                ss(row.get('NDOMA')), ss(row.get('NKV')), ss(row.get('PHONE')),
                ss(row.get('POLIS_S')), ss(row.get('POLIS_N')),
                bool(row.get('RESIDENT', True)), bool(row.get('LIVE', True)),
                bool(row.get('DEKRET', False)), bool(row.get('GKDC', False)),
            ))
            # Медотвод из T_PERSON → PatientMedExemption (нет createdAt/updatedAt)
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
                    VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING
                """, (exempt_id, new_id, motv_map[motv_id_raw], date_from, date_to))
                cur.execute('UPDATE "Patient" SET "activeMedExemptionId"=%s WHERE id=%s',
                            (exempt_id, new_id))
            patient_count += 1
        print(f"   {patient_count} пациентов")

        # 12. VaccinationRecord (есть createdAt/updatedAt)
        print("12/12 VaccinationRecord (T_NOZ1)...")
        _, noz1s = read_dbf(str(p / 'T_NOZ1.dbf'))
        rec_count = 0
        for row in noz1s:
            patient_new = person_map.get(ii(row['ID_PERS']))
            if not patient_new: continue
            vac_date = row.get('DT_PRIV')
            if not isinstance(vac_date, datetime.date): continue
            cur.execute("""
                INSERT INTO "VaccinationRecord" (
                    id, "patientId", "vaccineScheduleId", "vaccineId", "doctorId",
                    "isEpid", "isExternal", "ageYears", "ageMonths", "ageDays",
                    "vaccinationDate", "doseNumber", series, "checkNumber", result,
                    "medExemptionTypeId", "medExemptionDate", "nextScheduledDate",
                    "createdAt", "updatedAt"
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NOW())
                ON CONFLICT DO NOTHING
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
        print(f"   {rec_count} записей вакцинации")

        conn.commit()
        print("\n✅ Миграция завершена!")
        print(f"   Пациентов: {patient_count} | Вакцинаций: {rec_count}")
        print(f"   Вакцин: {len(vaccin_map)} | Нацкалендарь: {len(priv_map)} поз.")

    except Exception as e:
        conn.rollback()
        print(f"\n❌ Ошибка: {e}")
        import traceback; traceback.print_exc()
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dbf', required=True)
    parser.add_argument('--dsn', required=True)
    args = parser.parse_args()
    migrate(args.dbf, args.dsn)
