export type Form063Row = {
  step: string         // Вакцинация / 1V / 1RV / …
  ageLabel: string     // 3дн., 1г.2м.
  date: string         // 11.10.2016
  dose: string
  series: string
  vaccineName: string
  reaction: string
  medExemption: string
}

export type Form063OtherRow = {
  diseaseName: string
  step: string
  ageLabel: string
  date: string
  dose: string
  series: string
  vaccineName: string
  reaction: string
}

export type TubeTestRow = {
  date: string
  result: string
}

export type VacRevSplit = {
  vaccination: Form063Row[]
  revaccination: Form063Row[]
}

export type Form063Data = {
  okud: string
  okpo: string
  lpuName: string
  dateBegin: string

  fullName: string
  birthday: string
  sex: string
  address: string
  policySerial: string
  policyNumber: string

  tuberculosis: VacRevSplit
  tubeTests: TubeTestRow[]
  polio: Form063Row[]
  dtk: VacRevSplit          // дифтерия + коклюш + столбняк
  mumps: Form063Row[]
  measles: Form063Row[]
  rubella: Form063Row[]
  hepatitisB: Form063Row[]
  other: Form063OtherRow[]
}

/**
 * Сертификат о профилактических прививках — выдаётся пациенту.
 * Структура повторяет шаблон Visual FoxPro: шапка ЛПУ + блок ФИО + секции по
 * нозологиям, у каждой своя мини-таблица. Колонки секций различаются (у Манту
 * есть «Разведение» и «Рез-т», у БЦЖ — «Рез-т», у остальных — без), поэтому
 * таблица описывается обобщённо: массив колонок-заголовков и массив строк.
 */
export type CertificateSection = {
  title: string         // «Реакция Манту», «Туберкулёз», «Дифтерия» и т.п.
  columns: string[]     // Заголовки колонок (5–7 штук в зависимости от секции)
  rows: string[][]      // Каждый ряд — массив значений строго по длине columns
}

export type CertificateData = {
  fullName: string      // ФИО полностью
  birthday: string      // 11.10.2016
  city: string          // «Город Москва»
  issuedAt: string      // дата формирования (20.04.2026)
  lpuName: string       // полное название ЛПУ + (отделение)
  sections: CertificateSection[]
}
