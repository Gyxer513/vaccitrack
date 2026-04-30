-- Переименование Patient.isSelfOrganized → Patient.isOrganized
-- В разговоре с заказчиком уточнено: «организованный» — это уже устоявшийся
-- термин («посещает сад/школу»), приставка «само-» вводила в заблуждение.

ALTER TABLE "Patient" RENAME COLUMN "isSelfOrganized" TO "isOrganized";
