import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  PageNumber,
  Packer,
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
import type { CertificateData, CertificateSection } from '../types'

// A4 портрет: 11906 × 16838 DXA. Поля 1100 (~0.76") — даёт content-width ≈ 9706.
const CONTENT_W = 9706
const FONT = 'Times New Roman'

// LRC-лого. Грузим один раз при подключении модуля.
const LOGO_PNG = readFileSync(resolve(__dirname, '..', '..', 'assets', 'lrc-mark.png'))

type BorderSide = { size: number; color: string; style: (typeof BorderStyle)[keyof typeof BorderStyle] }
type BorderBox = { top: BorderSide; bottom: BorderSide; left: BorderSide; right: BorderSide }

const THIN: BorderSide = { size: 4, color: '000000', style: BorderStyle.SINGLE }
const ALL_BORDERS: BorderBox = { top: THIN, bottom: THIN, left: THIN, right: THIN }
const NO_BORDER_SIDE: BorderSide = { size: 0, color: 'FFFFFF', style: BorderStyle.NONE }
const NO_BORDERS: BorderBox = {
  top: NO_BORDER_SIDE, bottom: NO_BORDER_SIDE, left: NO_BORDER_SIDE, right: NO_BORDER_SIDE,
}

/* ——— примитивы ——— */

function run(
  text: string,
  opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {},
): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: (opts.size ?? 10) * 2, // half-points
    bold: opts.bold,
    italics: opts.italics,
    color: opts.color,
  })
}

function para(
  children: TextRun[] | string,
  opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spacing?: { before?: number; after?: number; line?: number }; bold?: boolean; size?: number; color?: string } = {},
): Paragraph {
  const runs = typeof children === 'string'
    ? [run(children, { bold: opts.bold, size: opts.size, color: opts.color })]
    : children
  return new Paragraph({
    alignment: opts.align,
    spacing: opts.spacing ?? { after: 0 },
    children: runs,
  })
}

function cell(
  children: Paragraph[] | string,
  opts: {
    width?: number
    bold?: boolean
    align?: (typeof AlignmentType)[keyof typeof AlignmentType]
    shading?: string
    size?: number
    borders?: BorderBox
    columnSpan?: number
    rowSpan?: number
  } = {},
): TableCell {
  const paras = typeof children === 'string'
    ? [para([run(children, { bold: opts.bold, size: opts.size })], { align: opts.align ?? AlignmentType.LEFT })]
    : children
  return new TableCell({
    children: paras,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.shading ? { fill: opts.shading } : undefined,
    borders: opts.borders ?? ALL_BORDERS,
    columnSpan: opts.columnSpan,
    rowSpan: opts.rowSpan,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  })
}

/* ——— Шапка с лого ——— */

function buildHeader(data: CertificateData): (Paragraph | Table)[] {
  // Тонкая разделительная линия (цвет брэнда — приглушённый бежевый).
  const rule = (afterSpacing = 200) =>
    new Paragraph({
      spacing: { before: 0, after: afterSpacing, line: 240 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C9BC9B', space: 1 },
      },
      children: [],
    })

  // Identification-band: лого как identifier-mark + название ЛПУ.
  // Лево-выравнивание, без рамок, без центральной парадности.
  const idBand = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          // Лого 56×56, прижато к левому краю, по центру по вертикали.
          cell(
            [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                spacing: { after: 0 },
                children: [
                  new ImageRun({
                    type: 'png',
                    data: LOGO_PNG,
                    transformation: { width: 56, height: 56 },
                  }),
                ],
              }),
            ],
            { width: Math.floor(CONTENT_W * 0.12), borders: NO_BORDERS },
          ),

          // Название ЛПУ, выровнено вертикально к лого.
          cell(
            [
              para([run(data.lpuName, { size: 11, bold: true })],
                   { align: AlignmentType.LEFT, spacing: { after: 40 } }),
              para([run('Детское отделение', { size: 9, color: '7A7260' })],
                   { align: AlignmentType.LEFT }),
            ],
            { width: Math.floor(CONTENT_W * 0.88), borders: NO_BORDERS },
          ),
        ],
      }),
    ],
  })

  // Заголовок документа: «Сертификат» крупно, без caps/разрядки;
  // подзаголовок строчными курсивом — современная иерархия.
  const titleBlock: Paragraph[] = [
    para(
      [run('Сертификат', { bold: true, size: 32 })],
      { align: AlignmentType.LEFT, spacing: { before: 360, after: 0 } },
    ),
    para(
      [run('о профилактических прививках', { size: 13, italics: true, color: '7A7260' })],
      { align: AlignmentType.LEFT, spacing: { after: 200 } },
    ),
  ]

  // Блок пациента — герой документа.
  const patientBlock: Paragraph[] = [
    para(
      [run(data.fullName, { bold: true, size: 16 })],
      { align: AlignmentType.LEFT, spacing: { after: 40 } },
    ),
  ]
  // Меточная строка: «Дата рождения · Город · Выдан»
  const metaParts: string[] = [`Дата рождения ${data.birthday}`]
  if (data.city) metaParts.push(data.city)
  metaParts.push(`Выдан ${data.issuedAt}`)
  patientBlock.push(
    para(
      [run(metaParts.join('  ·  '), { size: 10, color: '7A7260' })],
      { align: AlignmentType.LEFT, spacing: { after: 200 } },
    ),
  )

  return [
    idBand,
    rule(0),
    ...titleBlock,
    rule(160),
    ...patientBlock,
    rule(280),
  ]
}

/* ——— Секция-нозология (одна таблица) ——— */

/**
 * Доли колонок по семантике. 7-колоночные секции (Манту, БЦЖ) и 6-колоночные
 * (остальные) суммируют долями до 100% — обе таблицы получают одинаковую
 * абсолютную ширину = CONTENT_W. Визуально левый и правый края идеально
 * совпадают между секциями.
 */
const W_7COL = [0.18, 0.28, 0.09, 0.11, 0.07, 0.12, 0.15] // Кратность · Препарат · Возр · Дата · Доза · Серия · Рез-т
const W_6COL = [0.22, 0.33, 0.10, 0.13, 0.08, 0.14]       //                                            (без Рез-т)

function widthsFor(colCount: number): number[] {
  const ratios = colCount === 7 ? W_7COL : W_6COL
  return ratios.map((r) => Math.floor(CONTENT_W * r))
}

function buildSectionTable(section: CertificateSection): Table {
  const colCount = section.columns.length
  const widths = widthsFor(colCount)

  // Строка 1: заголовок секции — одна ячейка через columnSpan, мягкая подложка.
  const titleRow = new TableRow({
    children: [
      cell(
        [para([run(section.title, { bold: true, size: 11 })], { align: AlignmentType.LEFT })],
        { columnSpan: colCount, shading: 'EFE8D7', width: CONTENT_W },
      ),
    ],
  })

  // Строка 2: заголовки колонок.
  const headerRow = new TableRow({
    tableHeader: true,
    children: section.columns.map((h, i) =>
      cell(h, {
        width: widths[i],
        bold: true,
        align: AlignmentType.CENTER,
        shading: 'F7F4EC',
        size: 8,
      }),
    ),
  })

  // Строки данных. Если их нет — одна «пустая» строка на всю ширину.
  const dataRows = section.rows.length === 0
    ? [
        new TableRow({
          children: [
            cell(
              [para([run('— записей нет —', { italics: true, color: '888888', size: 9 })],
                    { align: AlignmentType.CENTER })],
              { columnSpan: colCount, width: CONTENT_W },
            ),
          ],
        }),
      ]
    : section.rows.map((rowVals) =>
        new TableRow({
          children: rowVals.map((v, i) =>
            cell(v ?? '', {
              width: widths[i],
              align: i < 2 ? AlignmentType.LEFT : AlignmentType.CENTER,
              size: 9,
              bold: i === 0,
            }),
          ),
        }),
      )

  return new Table({
    rows: [titleRow, headerRow, ...dataRows],
    width: { size: CONTENT_W, type: WidthType.DXA },
  })
}

/* ——— Главный сборщик ——— */

export function generateCertificateDocx(data: CertificateData): Promise<Buffer> {
  const headerBlocks = buildHeader(data)

  const sectionBlocks: (Paragraph | Table)[] = []
  for (const s of data.sections) {
    sectionBlocks.push(buildSectionTable(s))
    sectionBlocks.push(new Paragraph({ spacing: { after: 200 }, children: [] }))
  }

  const footer = new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            children: ['Страница ', PageNumber.CURRENT],
            font: FONT,
            size: 16,
            color: '888888',
          }),
          new TextRun({ text: '\t\t\t\t\t\t\t\t', font: FONT, size: 16 }),
          new TextRun({
            text: data.issuedAt,
            font: FONT,
            size: 16,
            color: '888888',
          }),
        ],
      }),
    ],
  })

  const doc = new Document({
    creator: 'Immunova',
    title: 'Сертификат о профилактических прививках',
    sections: [
      {
        properties: {
          page: {
            margin: { top: 900, right: 1100, bottom: 900, left: 1100 },
          },
        },
        footers: { default: footer },
        children: [
          ...headerBlocks,
          new Paragraph({ spacing: { after: 320 }, children: [] }),
          ...sectionBlocks,
        ],
      },
    ],
  })

  return Packer.toBuffer(doc) as Promise<Buffer>
}
