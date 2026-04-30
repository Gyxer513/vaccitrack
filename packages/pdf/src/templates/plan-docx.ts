import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * План профилактических прививок — отчёт по участку (.docx).
 *
 * Layout: A4 альбом, шапка ЛПУ + период + участок + каталог, таблица 18 колонок:
 *   ФИО / 16 нозологических групп / Примечание.
 * Каждая ячейка нозологии — короткий код (V1, RV, ДСТ…) + дата (дд.мм).
 *
 * Используется DocumentsService.planDocx и /api/v1/documents/plan.docx.
 * Структура повторяет старый FoxPro RTF-отчёт «План профилактических прививок
 * на дд.мм.гггг — дд.мм.гггг по участку № X».
 */

export type PlanGroupKey =
  | 'tuberkulin'
  | 'bcg'
  | 'akds'
  | 'kpk'
  | 'hepb'
  | 'hepa'
  | 'polio'
  | 'pneumo'
  | 'rota'
  | 'hib'
  | 'meningo'
  | 'varicella'
  | 'covid'
  | 'influenza'
  | 'hpv'
  | 'other'

export const PLAN_GROUPS: Array<{ key: PlanGroupKey; label: string }> = [
  { key: 'tuberkulin', label: 'Туберкулинодиагностика' },
  { key: 'bcg', label: 'БЦЖ' },
  { key: 'akds', label: 'Дифтерия,\nСтолбняк' },
  { key: 'kpk', label: 'Корь,\nКраснуха,\nПаротит' },
  { key: 'hepb', label: 'Гепатит В' },
  { key: 'hepa', label: 'Гепатит А' },
  { key: 'polio', label: 'Полиомиелит' },
  { key: 'pneumo', label: 'Пневмококк' },
  { key: 'rota', label: 'Ротавирусная\nинф.' },
  { key: 'hib', label: 'Гемофильная\nинф.' },
  { key: 'meningo', label: 'Менингококк.\nинф.' },
  { key: 'varicella', label: 'Ветряная\nоспа' },
  { key: 'covid', label: 'Covid-19' },
  { key: 'influenza', label: 'Грипп' },
  { key: 'hpv', label: 'ВПЧ' },
  { key: 'other', label: 'Прочее' },
]

export type PlanRow = {
  patientFio: string
  birthday: string         // 'дд.мм.гггг'
  cells: Partial<Record<PlanGroupKey, string>> // например { akds: 'V1\n21.04', polio: 'V1\n21.04' }
  note?: string
}

export type PlanData = {
  lpuName: string
  catalogName: string      // «Национальный календарь РФ (Приказ 1122н)»
  district: string         // «1» или «Круг.»
  fromDate: string         // 'дд.мм.гггг'
  toDate: string
  rows: PlanRow[]
}

// A4 альбом: 16838 × 11906 DXA. Поля 700 → content-width ≈ 15438.
const CONTENT_W = 15438
const FONT = 'Times New Roman'

const THIN = { size: 4, color: '000000', style: BorderStyle.SINGLE }
const ALL_BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN }
const NO_BORDER_SIDE = { size: 0, color: 'FFFFFF', style: BorderStyle.NONE }
const NO_BORDERS = { top: NO_BORDER_SIDE, bottom: NO_BORDER_SIDE, left: NO_BORDER_SIDE, right: NO_BORDER_SIDE }

const LOGO_PNG = (() => {
  try {
    return readFileSync(resolve(__dirname, '..', '..', 'assets', 'lrc-mark.png'))
  } catch {
    return null
  }
})()

/* ——— примитивы ——— */

function run(text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: (opts.size ?? 9) * 2,
    bold: opts.bold,
    italics: opts.italics,
    color: opts.color,
  })
}

function para(
  children: TextRun[] | string,
  opts: {
    align?: (typeof AlignmentType)[keyof typeof AlignmentType]
    spacing?: { before?: number; after?: number; line?: number }
    bold?: boolean
    size?: number
    italics?: boolean
  } = {},
): Paragraph {
  const runs = typeof children === 'string'
    ? [run(children, { bold: opts.bold, size: opts.size, italics: opts.italics })]
    : children
  return new Paragraph({
    alignment: opts.align,
    spacing: opts.spacing ?? { after: 0 },
    children: runs,
  })
}

// Многострочные подписи — каждый \n становится отдельным Paragraph.
function multilinePara(text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}): Paragraph[] {
  return text.split('\n').map((line) =>
    para([run(line, { bold: opts.bold, size: opts.size })], { align: opts.align ?? AlignmentType.CENTER }),
  )
}

function cell(
  children: Paragraph[] | string,
  opts: {
    width?: number
    bold?: boolean
    align?: (typeof AlignmentType)[keyof typeof AlignmentType]
    shading?: string
    size?: number
    borders?: typeof ALL_BORDERS | typeof NO_BORDERS
    columnSpan?: number
    rowSpan?: number
  } = {},
): TableCell {
  const paras = typeof children === 'string'
    ? [para([run(children, { bold: opts.bold, size: opts.size })], { align: opts.align ?? AlignmentType.CENTER })]
    : children
  return new TableCell({
    children: paras,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.shading ? { fill: opts.shading } : undefined,
    borders: opts.borders ?? ALL_BORDERS,
    columnSpan: opts.columnSpan,
    rowSpan: opts.rowSpan,
    margins: { top: 40, bottom: 40, left: 60, right: 60 },
  })
}

/* ——— шапка ——— */

function buildHeader(data: PlanData): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []

  // Identification-band: лого слева + ЛПУ-name. Если лого нет — просто ЛПУ.
  if (LOGO_PNG) {
    const logoCol = Math.floor(CONTENT_W * 0.07)
    const textCol = CONTENT_W - logoCol
    out.push(
      new Table({
        width: { size: CONTENT_W, type: WidthType.DXA },
        rows: [
          new TableRow({
            children: [
              cell(
                [
                  new Paragraph({
                    alignment: AlignmentType.LEFT,
                    spacing: { after: 0 },
                    children: [
                      new ImageRun({
                        type: 'png',
                        data: LOGO_PNG,
                        transformation: { width: 48, height: 48 },
                      }),
                    ],
                  }),
                ],
                { width: logoCol, borders: NO_BORDERS },
              ),
              cell(
                [
                  para([run(data.lpuName, { size: 12, bold: true })], { align: AlignmentType.LEFT, spacing: { after: 40 } }),
                  para([run(`План профилактических прививок на ${data.fromDate} — ${data.toDate} по участку № ${data.district}`, { size: 11, bold: true })], { align: AlignmentType.LEFT, spacing: { after: 40 } }),
                  para([run(`По календарю: ${data.catalogName}`, { size: 9, italics: true, color: '7A7260' })], { align: AlignmentType.LEFT }),
                ],
                { width: textCol, borders: NO_BORDERS },
              ),
            ],
          }),
        ],
      }),
    )
  } else {
    out.push(para([run(data.lpuName, { size: 12, bold: true })], { align: AlignmentType.CENTER, spacing: { after: 60 } }))
    out.push(para([run(`План профилактических прививок на ${data.fromDate} — ${data.toDate} по участку № ${data.district}`, { size: 11, bold: true })], { align: AlignmentType.CENTER, spacing: { after: 40 } }))
    out.push(para([run(`По календарю: ${data.catalogName}`, { size: 9, italics: true, color: '7A7260' })], { align: AlignmentType.CENTER, spacing: { after: 200 } }))
  }
  out.push(new Paragraph({ spacing: { after: 200 }, children: [] }))
  return out
}

/* ——— таблица ——— */

function buildTable(data: PlanData): Table {
  // 18 колонок: ФИО + 16 групп + Примечание.
  const fioW = Math.floor(CONTENT_W * 0.16)
  const noteW = Math.floor(CONTENT_W * 0.08)
  const groupsTotal = CONTENT_W - fioW - noteW
  const groupW = Math.floor(groupsTotal / PLAN_GROUPS.length)

  // Заголовочная строка.
  const headerCells: TableCell[] = []
  headerCells.push(
    cell(
      [para([run('ФИО / дата рождения', { size: 8, bold: true })], { align: AlignmentType.CENTER })],
      { width: fioW, shading: 'F0F0F0' },
    ),
  )
  for (const g of PLAN_GROUPS) {
    headerCells.push(
      cell(
        multilinePara(g.label, { bold: true, size: 7, align: AlignmentType.CENTER }),
        { width: groupW, shading: 'F0F0F0' },
      ),
    )
  }
  headerCells.push(
    cell(
      [para([run('Примечание', { size: 8, bold: true })], { align: AlignmentType.CENTER })],
      { width: noteW, shading: 'F0F0F0' },
    ),
  )
  const headerRow = new TableRow({ tableHeader: true, children: headerCells })

  const rows: TableRow[] = [headerRow]

  if (data.rows.length === 0) {
    rows.push(
      new TableRow({
        children: [
          cell(
            [para([run('Нет плановых прививок в указанном периоде', { italics: true, size: 9, color: '888888' })], { align: AlignmentType.CENTER })],
            { columnSpan: PLAN_GROUPS.length + 2, width: CONTENT_W },
          ),
        ],
      }),
    )
  } else {
    for (const r of data.rows) {
      const cells: TableCell[] = []
      // ФИО + дата рождения двумя строками.
      cells.push(
        cell(
          [
            para([run(r.patientFio, { size: 9, bold: true })], { align: AlignmentType.LEFT }),
            para([run(r.birthday, { size: 7, color: '7A7260' })], { align: AlignmentType.LEFT }),
          ],
          { width: fioW, align: AlignmentType.LEFT },
        ),
      )
      for (const g of PLAN_GROUPS) {
        const v = r.cells[g.key] ?? ''
        if (!v) {
          cells.push(cell(' ', { width: groupW, size: 8 }))
        } else {
          cells.push(
            cell(
              multilinePara(v, { size: 7, align: AlignmentType.CENTER }),
              { width: groupW },
            ),
          )
        }
      }
      cells.push(cell(r.note ?? ' ', { width: noteW, size: 7 }))
      rows.push(new TableRow({ children: cells }))
    }
  }

  return new Table({
    rows,
    width: { size: CONTENT_W, type: WidthType.DXA },
  })
}

/* ——— главный сборщик ——— */

export async function generatePlanDocx(data: PlanData): Promise<Buffer> {
  const headerBlocks = buildHeader(data)
  const tbl = buildTable(data)

  const doc = new Document({
    creator: 'Immunova',
    title: `План прививок — участок ${data.district}`,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 18 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: 700, right: 700, bottom: 700, left: 700 },
          },
        },
        children: [
          ...headerBlocks,
          tbl,
        ],
      },
    ],
  })

  return Packer.toBuffer(doc) as Promise<Buffer>
}
