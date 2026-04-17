import { router } from './init'
import { patientRouter } from './routers/patient.router'
import { vaccinationRouter } from './routers/vaccination.router'
import { referenceRouter } from './routers/reference.router'

export const appRouter = router({
  patient: patientRouter,
  vaccination: vaccinationRouter,
  reference: referenceRouter,
})

export type AppRouter = typeof appRouter
