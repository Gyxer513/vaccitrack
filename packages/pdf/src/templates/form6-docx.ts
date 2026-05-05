import {
  AlignmentType,
  BorderStyle,
  Document,
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

export type Form6ColumnKey =
  | 'c04' | 'c05' | 'c06' | 'c07' | 'c08' | 'c09' | 'c10'
  | 'c11' | 'c12' | 'c13' | 'c14' | 'c15' | 'c16' | 'c17'
  | 'c18' | 'c19' | 'c20' | 'c21' | 'c22' | 'c23' | 'c24' | 'c25' | 'c26' | 'c27' | 'c28' | 'c29'
  | 'c30' | 'c31' | 'c32' | 'c33'

export type Form6Section1Row = {
  line: string
  ageLabel: string
  registered: number
  values: Record<Form6ColumnKey, number>
}

export type Form6Section2Row = {
  line: string
  ageLabel: string
  vaccineLabel: string
  registered: number
  done: number
}

export type Form6Data = {
  lpuName: string
  okpo?: string
  year: number
  generatedAt: string
  section1: Form6Section1Row[]
  section2: Form6Section2Row[]
}

const FONT = 'Times New Roman'
const CONTENT_W = 15438
const THIN = { size: 4, color: '000000', style: BorderStyle.SINGLE }
const ALL_BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN }

function run(text: string, opts: { bold?: boolean; size?: number; italics?: boolean } = {}): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: (opts.size ?? 8) * 2,
    bold: opts.bold,
    italics: opts.italics,
  })
}

function para(
  text: string | TextRun[],
  opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean; size?: number; italics?: boolean } = {},
): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: 80 },
    children: typeof text === 'string' ? [run(text, opts)] : text,
  })
}

function cell(
  text: string | Paragraph[],
  opts: {
    width?: number
    bold?: boolean
    size?: number
    align?: (typeof AlignmentType)[keyof typeof AlignmentType]
    shading?: string
    columnSpan?: number
  } = {},
): TableCell {
  const children = typeof text === 'string'
    ? text.split('\n').map((line) => para(line, { align: opts.align ?? AlignmentType.CENTER, bold: opts.bold, size: opts.size }))
    : text
  return new TableCell({
    children,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    borders: ALL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.shading ? { fill: opts.shading } : undefined,
    columnSpan: opts.columnSpan,
    margins: { top: 35, bottom: 35, left: 45, right: 45 },
  })
}

function emptyPara(): Paragraph {
  return new Paragraph({ spacing: { after: 80 }, children: [] })
}

const SECTION1_PARTS: Array<{ title: string; columns: Array<{ key: Form6ColumnKey; no: string; label: string }> }> = [
  {
    title: 'Дифтерия, коклюш',
    columns: [
      { key: 'c04', no: '4', label: 'Дифтерия\nвакцинация' },
      { key: 'c05', no: '5', label: 'Дифтерия\nревакц. I' },
      { key: 'c06', no: '6', label: 'Дифтерия\nревакц. II' },
      { key: 'c07', no: '7', label: 'Дифтерия\nревакц. III' },
      { key: 'c08', no: '8', label: 'Дифтерия\nревакц. IV' },
      { key: 'c09', no: '9', label: 'Коклюш\nвакцинация' },
      { key: 'c10', no: '10', label: 'Коклюш\nревакцинация' },
    ],
  },
  {
    title: 'Полиомиелит, туберкулез, гепатит B',
    columns: [
      { key: 'c11', no: '11', label: 'Полиомиелит\nвакцинация' },
      { key: 'c12', no: '12', label: 'Полиомиелит\nревакц. I' },
      { key: 'c13', no: '13', label: 'Полиомиелит\nревакц. II' },
      { key: 'c14', no: '14', label: 'Полиомиелит\nревакц. III' },
      { key: 'c15', no: '15', label: 'Туберкулез\nвакцинация' },
      { key: 'c16', no: '16', label: 'Туберкулез\nревакцинация' },
      { key: 'c17', no: '17', label: 'Гепатит B\nвакцинация' },
    ],
  },
  {
    title: 'Корь, эпидемический паротит, краснуха',
    columns: [
      { key: 'c18', no: '18', label: 'Корь\nпереболело' },
      { key: 'c19', no: '19', label: 'Корь\nиз них привито' },
      { key: 'c20', no: '20', label: 'Корь\nвакцинация' },
      { key: 'c21', no: '21', label: 'Корь\nревакцинация' },
      { key: 'c22', no: '22', label: 'Паротит\nпереболело' },
      { key: 'c23', no: '23', label: 'Паротит\nиз них привито' },
      { key: 'c24', no: '24', label: 'Паротит\nвакцинация' },
      { key: 'c25', no: '25', label: 'Паротит\nревакцинация' },
      { key: 'c26', no: '26', label: 'Краснуха\nпереболело' },
      { key: 'c27', no: '27', label: 'Краснуха\nиз них привито' },
      { key: 'c28', no: '28', label: 'Краснуха\nвакцинация' },
      { key: 'c29', no: '29', label: 'Краснуха\nревакцинация' },
    ],
  },
  {
    title: 'Пневмококковая и гемофильная инфекции',
    columns: [
      { key: 'c30', no: '30', label: 'Пневмококковая\nвакцинация' },
      { key: 'c31', no: '31', label: 'Пневмококковая\nревакцинация' },
      { key: 'c32', no: '32', label: 'Гемофильная\nвакцинация' },
      { key: 'c33', no: '33', label: 'Гемофильная\nревакцинация' },
    ],
  },
]

function section1Table(rows: Form6Section1Row[], part: (typeof SECTION1_PARTS)[number]): Table {
  const ageW = 2800
  const lineW = 650
  const registeredW = 1000
  const colW = Math.floor((CONTENT_W - ageW - lineW - registeredW) / part.columns.length)
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell(part.title, { columnSpan: part.columns.length + 3, bold: true, size: 9, shading: 'EDEDED' }),
        ],
      }),
      new TableRow({
        tableHeader: true,
        children: [
          cell('Возрастные группы', { width: ageW, bold: true, size: 7, shading: 'F5F5F5' }),
          cell('N строки', { width: lineW, bold: true, size: 7, shading: 'F5F5F5' }),
          cell('Состоит\nна учете', { width: registeredW, bold: true, size: 7, shading: 'F5F5F5' }),
          ...part.columns.map((c) => cell(c.label, { width: colW, bold: true, size: 6, shading: 'F5F5F5' })),
        ],
      }),
      new TableRow({
        tableHeader: true,
        children: [
          cell('1', { width: ageW, size: 6 }),
          cell('2', { width: lineW, size: 6 }),
          cell('3', { width: registeredW, size: 6 }),
          ...part.columns.map((c) => cell(c.no, { width: colW, size: 6 })),
        ],
      }),
      ...rows.map((r) => new TableRow({
        children: [
          cell(r.ageLabel, { width: ageW, size: 7, align: AlignmentType.LEFT }),
          cell(r.line, { width: lineW, size: 7 }),
          cell(String(r.registered), { width: registeredW, size: 7 }),
          ...part.columns.map((c) => cell(String(r.values[c.key] ?? 0), { width: colW, size: 7 })),
        ],
      })),
    ],
  })
}

function section2Table(rows: Form6Section2Row[]): Table {
  const widths = [2500, 5200, 850, 2600, 4288]
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell('Возраст', { width: widths[0], bold: true, size: 7, shading: 'F5F5F5' }),
          cell('Вид профилактической прививки', { width: widths[1], bold: true, size: 7, shading: 'F5F5F5' }),
          cell('N строки', { width: widths[2], bold: true, size: 7, shading: 'F5F5F5' }),
          cell('Состоит\nна учете детей', { width: widths[3], bold: true, size: 7, shading: 'F5F5F5' }),
          cell('Число детей, которым сделана соответствующая прививка\nпо достижении указанного возраста', { width: widths[4], bold: true, size: 7, shading: 'F5F5F5' }),
        ],
      }),
      ...rows.map((r) => new TableRow({
        children: [
          cell(r.ageLabel, { width: widths[0], size: 7, align: AlignmentType.LEFT }),
          cell(r.vaccineLabel, { width: widths[1], size: 7, align: AlignmentType.LEFT }),
          cell(r.line, { width: widths[2], size: 7 }),
          cell(String(r.registered), { width: widths[3], size: 7 }),
          cell(String(r.done), { width: widths[4], size: 7 }),
        ],
      })),
    ],
  })
}

export async function generateForm6Docx(data: Form6Data): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [
    para('ФЕДЕРАЛЬНОЕ СТАТИСТИЧЕСКОЕ НАБЛЮДЕНИЕ', { align: AlignmentType.CENTER, bold: true, size: 11 }),
    para('Форма N 6', { align: AlignmentType.CENTER, bold: true, size: 14 }),
    para('Сведения о контингентах детей и взрослых, привитых против инфекционных заболеваний', { align: AlignmentType.CENTER, bold: true, size: 12 }),
    para(`за ${data.year} год`, { align: AlignmentType.CENTER, bold: true, size: 11 }),
    emptyPara(),
    para(`Организация: ${data.lpuName}`, { size: 9 }),
    para(`ОКПО: ${data.okpo || ''}`, { size: 8 }),
    para(`Дата формирования: ${data.generatedAt}`, { size: 8 }),
    emptyPara(),
    para('1. Контингенты детей и взрослых, привитых против инфекционных заболеваний, человек (1000)', { bold: true, size: 10 }),
  ]

  for (const part of SECTION1_PARTS) {
    children.push(section1Table(data.section1, part), emptyPara())
  }

  children.push(
    para('2. Контингенты детей, получивших профилактические прививки против инфекционных заболеваний в декретированный возраст, человек (2000)', { bold: true, size: 10 }),
    section2Table(data.section2),
  )

  const doc = new Document({
    creator: 'Immunova',
    title: `Форма 6 за ${data.year} год`,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 16 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: 650, right: 650, bottom: 650, left: 650 },
          },
        },
        children,
      },
    ],
  })

  return Packer.toBuffer(doc) as Promise<Buffer>
}

