export type VaccinationRow = {
  scheduleName: string
  doseKey: string
  ageLabel: string
  date: string
  series: string
  doctorName: string
  result: string
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
  vaccinations: VaccinationRow[]
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
