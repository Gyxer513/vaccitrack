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

export type CertificateData = {
  fullName: string
  birthday: string
  policyNumber: string
  lpuName: string
  vaccinations: {
    name: string
    date: string
    series: string
    dose: string
    nextDate: string
  }[]
}
