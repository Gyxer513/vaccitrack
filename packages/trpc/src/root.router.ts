import { router } from './init'
import { patientRouter } from './routers/patient.router'
import { vaccinationRouter } from './routers/vaccination.router'
import { referenceRouter } from './routers/reference.router'
import { vaccineRouter } from './routers/vaccine.router'
import { scheduleRouter } from './routers/schedule.router'
import { catalogRouter } from './routers/catalog.router'

export const appRouter = router({
  patient: patientRouter,
  vaccination: vaccinationRouter,
  reference: referenceRouter,
  vaccine: vaccineRouter,
  schedule: scheduleRouter,
  catalog: catalogRouter,
})

export type AppRouter = typeof appRouter
