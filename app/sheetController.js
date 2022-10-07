'use strict'
const XLSX = require('xlsx')
const { GoogleSpreadsheet } = require('google-spreadsheet')
const path = require('path')
const removeDiacritics = require('./removeDiacritics')
const creds = require('./config/competencia-digital-340823-700c0845d75f.json')

const currentData = {}

const CDC_CURSO = 'CDC_CURSO'
const FAIL_CURSO = 'FAIL_CURSO'
const DRIVE_ORIGIN_FILE = '1yvlUiyttEWkYc22hTaFCo7WpewEz3onKsK0BDGpc8qw'

// global variables
const DEBUG = true
let ENV = 'TEST_' // empty for production
// const ENV=''
const MAX_MARK = 'B1'
const marks = ['', 'A1', 'A2', MAX_MARK, 'B2', 'C1']
const NO_REPLICATE = [
  'PALABRA_CLAVE',
  'SINONIMOS',
  'SINÓNIMOS',
  'GRUPO 1',
  'GRUPO 2',
  'keywords',
  'MODIFICADORES_GRUPO',
]
let fields, centers, rawCourses, keywordsData, competenciasData, doc

const CAMPOS_COMPETENCIAS = [
  '1.1',
  '1.2',
  '1.3',
  '1.4',
  '1.5',
  '2.1',
  '2.2',
  '2.3',
  '3.1',
  '3.2',
  '3.3',
  '3.4',
  '4.1',
  '4.2',
  '4.3',
  '5.1',
  '5.2',
  '5.3',
  '6.1',
  '6.2',
  '6.3',
  '6.4',
  '6.5',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const jsonMsg = (msg = '', running = true, error = '') => {
  currentData.msg = msg
  currentData.running = running
  currentData.error = error
  return currentData
}

const checkOnlineCourse = (course) =>
  [
    'CURSOS A DISTANCIA',
    'CURSOS MIXTOS',
    'CURSO ONLINE',
    'CURSOS ONLINE',
  ].includes(course.MODALIDAD)

const checkCoordinator = (course) =>
  ['COORDINADOR/A', 'PONENTE-COORDINADOR'].includes(course.TIPO_PARTICIPACION)

const checkJornadaCongresos = (course) =>
  ['CONGRESO', 'CONGRESOS', 'JORNADA', 'JORNADAS'].includes(course.MODALIDAD)

/** 
    genera un  campo  keywords en base a sinonimos y a la propia palabra clave
**/

const processsKeywords = (data) => {
  const dataWithKeywords = data.map((item) => {
    const { PALABRA_CLAVE, SINONIMOS, MODIFICADORES_GRUPO } = item
    const keywords = SINONIMOS
      ? SINONIMOS.split(',')
          .map((item) => item.trim())
          .map((item) => removeDiacritics(item).toLowerCase())
      : []
    if (PALABRA_CLAVE)
      keywords.push(removeDiacritics(PALABRA_CLAVE.trim()).toLowerCase())
    if (MODIFICADORES_GRUPO)
      keywords.push(removeDiacritics(MODIFICADORES_GRUPO.trim()).toLowerCase())
    return { ...item, keywords }
  })
  return dataWithKeywords
}

const getData = async (io) => {
  const idDoc = ENV
    ? '1BnoqcyDp8x4zCWBGlrtIfMBFeY3UgC0W9Wa78xHuFo8'
    : '1xEK7sK9KOwFwTU2BnhtCy4S70-G3bA1dqrLJv9R427g'
  // '1BnoqcyDp8x4zCWBGlrtIfMBFeY3UgC0W9Wa78xHuFo8'
  doc = new GoogleSpreadsheet(idDoc)
  await doc.useServiceAccountAuth(creds)
  await doc.loadInfo()
  /* get Data from excel for PROD, otherwise from drive */
  if (ENV) {
    rawCourses = await load_data_from_drive(io)
  } else {
    rawCourses = load_data(path.resolve(__dirname, 'data', `${ENV}data.xlsx`))
  }
  // loads worksheets
  ;[fields, centers, keywordsData, competenciasData] = await Promise.all([
    readFields(io),
    readCenters(io),
    readKeywords(`PALABRAS_CLAVE`, io),
    readKeywords(`COMPETENCIAS`, io),
  ])
}

const removeExtraColumns = (courses) => {
  const newCourses = courses.map((item) => {
    const newItem = {}
    for (const field of fields) {
      newItem[field] = item[field] ?? ''
    }
    return newItem
  })
  return newCourses
}

const readKeywords = async (sheetName, io) => {
  console.log(`Leyendo hoja de ${sheetName}`)
  io.emit('status', jsonMsg(`Leyendo hoja de ${sheetName}`))
  if (!doc.sheetsByTitle[sheetName]) {
    console.err(`Sheet ${sheetName} not found`)
    throw Error(`Sheet ${sheetName} not found`)
  }
  const sheet = doc.sheetsByTitle[sheetName]
  const rows = await sheet.getRows()
  const dataRows = rows.map((row) => {
    const item = {}
    for (const [index, column] of row._sheet.headerValues.entries()) {
      const value = row._rawData[index] ?? ''
      item[column] = value
    }
    return item
  })
  return dataRows
}

const readFields = async (io) => {
  const sheet = doc.sheetsByTitle[`CAMPOS`]
  console.log(`Leyendo hoja de CAMPOS`)
  io.emit('status', jsonMsg(`Leyendo hoja de CAMPOS`))
  const rows = await sheet.getRows() // can pass in { limit, offset }
  // read/write row values
  return rows.map((row) => row._rawData[0])
}

const readCenters = async (io) => {
  const sheet = doc.sheetsByTitle[`CENTROS`]
  console.log(`Leyendo hoja de CENTROS`)
  io.emit('status', jsonMsg(`Leyendo hoja de CENTROS`))
  const rows = await sheet.getRows() // can pass in { limit, offset }
  // read/write row values
  return rows.map((row) =>
    removeDiacritics(String(row._rawData[0]).trim()).toLowerCase()
  )
}

function load_data(file) {
  var wb = XLSX.readFile(file)
  /* generate array of arrays */
  const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
  return data
}

const load_data_from_drive = async (io) => {
  console.log(`Obteniendo fuente de datos de Google Drive`)
  io.emit('status', jsonMsg(`Obteniendo fuente de datos de Google Drive`))

  const datosOrigen = new GoogleSpreadsheet(DRIVE_ORIGIN_FILE)
  const sheetName = 'DEBUG'
  await datosOrigen.useServiceAccountAuth(creds)
  await datosOrigen.loadInfo()

  if (!datosOrigen.sheetsByTitle[sheetName]) {
    console.err(`Sheet ${sheetName} not found`)
    throw Error(`Sheet ${sheetName} not found`)
  }
  const sheet = datosOrigen.sheetsByTitle[sheetName]
  const rows = await sheet.getRows()
  const dataRows = rows.map((row) => {
    const item = {}
    for (const [index, column] of row._sheet.headerValues.entries()) {
      const value = row._rawData[index] ?? ''
      item[column] = value
    }
    return item
  })
  return dataRows
}

const generateSheet = async (req, res, io) => {
  try {
    const groups = new Set()
    const groupsEval = {}
    if (req.params.test === 'prod') ENV = ''
    else ENV = 'TEST_'
    console.log('¡Comenzamos!')
    if (currentData.running) {
      io.emit('status', currentData)
      res.json(currentData)
    }
    io.emit('status', jsonMsg('¡Comenzamos!'))

    await getData(io)
    const courses = removeExtraColumns(rawCourses)
    const keywords = processsKeywords(keywordsData)
    const competencias = processsKeywords(competenciasData)
    /*  dividimos centros: con o sin palabras clave
        los que tienen palabras clave, se les asignan grupos 
        y valoración en base a keywords */
    console.log('Valorando centros por palabras clave.....')
    io.emit('status', jsonMsg('Valorando centros por palabras clave.....'))
    const [passCDCCourses, failCDCCourses] = courses.reduce(
      ([p, f], course) => {
        const courseGrouped = { ...course, grupos: new Set() }
        const titulo = removeDiacritics(course.TITULO.replace(/\n/g, ' '))
          .toLowerCase()
          .replace(/[^0-9a-z ]/gi, '')
        const objetivo = removeDiacritics(course.OBJETIVO.replace(/\n/g, ' '))
          .toLowerCase()
          .replace(/[^0-9a-z ]/gi, '')
        const contenido = removeDiacritics(course.CONTENIDO.replace(/\n/g, ' '))
          .toLowerCase()
          .replace(/[^0-9a-z ]/gi, '')
        const tituloArray = titulo.split(' ')
        const objetivoArray = objetivo.split(' ')
        const contenidoArray = contenido.split(' ')
        // una keyword se puede repetir porque puede estar en varios grupos.
        for (const keyword of keywords) {
          if (
            keyword.keywords.some((key) => {
              if (key.split(' ').length > 1) {
                if (
                  titulo.includes(key) ||
                  objetivo.includes(key) ||
                  contenido.includes(key)
                ) {
                  if (DEBUG)
                    courseGrouped.debug = courseGrouped.debug
                      ? courseGrouped.debug + `key-"${key}" `
                      : `key-"${key}" `
                  return true
                }
                return false
              } else {
                if (
                  key.length > 2 &&
                  (tituloArray.includes(key) ||
                    objetivoArray.includes(key) ||
                    contenidoArray.includes(key))
                ) {
                  if (DEBUG)
                    courseGrouped.debug = courseGrouped.debug
                      ? courseGrouped.debug + `key-"${key}" `
                      : `key-"${key}" `
                  return true
                }
                return false
              }
            })
          ) {
            // añadimos el grupo a un campo grupos para procesamiento posterior
            if (keyword['GRUPO 1']) {
              courseGrouped.grupos.add(String(keyword['GRUPO 1']).trim())
              // llevamos registro de grupos para cargar sus configuraciones
              groups.add(String(keyword['GRUPO 1']).trim())
              if (DEBUG) courseGrouped.debug += `group-"${keyword['GRUPO 1']}" `
            }
            if (keyword['GRUPO 2']) {
              courseGrouped.grupos.add(String(keyword['GRUPO 2']).trim())
              // llevamos registro de grupos para cargar sus configuraciones
              groups.add(String(keyword['GRUPO 2']).trim())
              if (DEBUG) courseGrouped.debug += `group-"${keyword['GRUPO 2']}" `
            }
            // evaluamos según palabras clave, si tiene varias cogemos puntuación máxima
            for (const [key, value] of Object.entries(keyword)) {
              if (NO_REPLICATE.includes(key)) continue
              const prevVal = marks.indexOf(courseGrouped[key] ?? '')
              const newVal = marks.indexOf(value)
              if (newVal > prevVal) courseGrouped[key] = value
            }
          }
        }
        return courseGrouped.grupos.size
          ? [[...p, courseGrouped], f]
          : [p, [...f, courseGrouped]]
      },
      [[], []]
    )

    console.log(
      `Procesados centros por palabras clave: ${passCDCCourses.length} centros con palabras clave, ${failCDCCourses.length} sin palabras clave`
    )
    io.emit(
      'status',
      jsonMsg(
        `Procesados centros por palabras clave: ${passCDCCourses.length} centros con palabras clave, ${failCDCCourses.length} sin palabras clave`
      )
    )
    /* cargamos tabla de valoraciones de cada grupo */
    await Promise.all(
      [...groups].map(async (group) => {
        const tmpData = await readKeywords(group, io)
        groupsEval[group] = processsKeywords(tmpData)
      })
    )

    const evalCourses = passCDCCourses.map((course) => {
      const titulo = removeDiacritics(course.TITULO.replace(/\n/g, ' '))
        .toLowerCase()
        .replace(/[^0-9a-z ]/gi, '')
      const objetivo = removeDiacritics(course.OBJETIVO.replace(/\n/g, ' '))
        .toLowerCase()
        .replace(/[^0-9a-z ]/gi, '')
      const contenido = removeDiacritics(course.CONTENIDO.replace(/\n/g, ' '))
        .toLowerCase()
        .replace(/[^0-9a-z ]/gi, '')
      const tituloArray = titulo.split(' ')
      const objetivoArray = objetivo.split(' ')
      const contenidoArray = contenido.split(' ')

      /* asignamos valoración en  base a grupos */
      for (const grupo of course.grupos) {
        for (const modificador of groupsEval[grupo]) {
          if (
            modificador.keywords.some((key) => {
              if (key.split(' ').length > 1) {
                if (
                  titulo.includes(key) ||
                  objetivo.includes(key) ||
                  contenido.includes(key)
                ) {
                  if (DEBUG)
                    course.debug = course.debug
                      ? course.debug + `mod-"${key}" `
                      : `mod-"${key}" `
                  return true
                }
                return false
              } else {
                if (
                  key.length > 2 &&
                  (tituloArray.includes(key) ||
                    objetivoArray.includes(key) ||
                    contenidoArray.includes(key))
                ) {
                  if (DEBUG)
                    course.debug = course.debug
                      ? course.debug + `mod-"${key}" `
                      : `mod-"${key}" `
                  return true
                }
                return false
              }
            })
          ) {
            for (const [key, value] of Object.entries(modificador)) {
              if (NO_REPLICATE.includes(key)) continue
              /* si no tiene valor, no sumamos */
              if (!course[key]) continue
              const prevVal = Math.max(marks.indexOf(course[key]), 0)
              const newVal = prevVal + Number(value)
              course[key] =
                newVal > marks.indexOf(MAX_MARK) ? MAX_MARK : marks[newVal]
            }
          }
        }
      }
      // quitamos el análisis por modificadores, ya que desvirtúa.
      /* por último, miramos por la lista de palabras clave de competencias */
      // for (const competencia of competencias) {
      //   if (
      //     competencia.keywords.some((key) => {
      //       if (key.split(' ').length > 1) {
      //         if (
      //           titulo.includes(key) ||
      //           objetivo.includes(key) ||
      //           contenido.includes(key)
      //         ) {
      //           if (DEBUG)
      //             course.debug = course.debug
      //               ? course.debug + `comp-"${key}" `
      //               : `comp-"${key}" `
      //           return true
      //         }
      //         return false
      //       } else {
      //         if (
      //           key.length > 2 &&
      //           (tituloArray.includes(key) ||
      //             objetivoArray.includes(key) ||
      //             contenidoArray.includes(key))
      //         ) {
      //           if (DEBUG)
      //             course.debug = course.debug
      //               ? course.debug + `comp-"${key}" `
      //               : `comp-"${key}" `
      //           return true
      //         }
      //         return false
      //       }
      //     })
      //   ) {
      //     for (const [key, value] of Object.entries(competencia)) {
      //       if (NO_REPLICATE.includes(key)) continue
      //       const prevVal = marks.indexOf(course[key] ?? '')
      //       const newVal = Math.max(marks.indexOf(competencia[key]), 0)
      //       course[key] = marks[Math.max(prevVal, newVal)]
      //     }
      //   }
      // }
      return course
    })

    const postEvalCourses = evalCourses.reduce((acc, course) => {
      /* Todas las digitales: 1.3 a A1. 1.1, 1.4 y 1.5 a A2. 3.1 a A1. 3.1 = max (3.2, 3.3, 3.4)  */
      course['1.3'] =
        marks[Math.max(marks.indexOf(course['1.3']), marks.indexOf('A1'))]
      for (const key of ['1.1', '1.4', '1.5'])
        course[key] =
          marks[Math.max(marks.indexOf(course[key]), marks.indexOf('A2'))]
      course['3.1'] =
        marks[
          Math.max(
            marks.indexOf(course['3.1']),
            marks.indexOf(course['3.2']),
            marks.indexOf(course['3.3']),
            marks.indexOf(course['3.4']),
            marks.indexOf('A1')
          )
        ]

      /* MODALIDAD Grupos de trabajo: De las 23 competencias  las que tengan subírselas a B1. */
      if (
        course.MODALIDAD === 'GRUPOS DE TRABAJO' ||
        course.MODALIDAD === 'GRUPO DE TRABAJO'
      ) {
        for (const key of ['2.1', '2.2', '2.3'])
          if (course[key])
            course[key] =
              marks[Math.max(marks.indexOf(course[key]), marks.indexOf('B1'))]
      }

      /* Cursos a distancia (pero que tengan tutor/a asociado, en la siguiente línea): las que tengan subírselas a B1 */
      if (acc.length) {
        const prevCourse = acc.at(-1)
        if (
          course.MODALIDAD === 'CURSOS A DISTANCIA' &&
          course.TIPO_PARTICIPACION === 'TUTOR/A' &&
          parseFloat(course.H) >= 10
        ) {
          if (
            prevCourse.CDCENTRO === course.CDCENTRO &&
            prevCourse.CDTPACTIVIDAD === course.CDTPACTIVIDAD &&
            prevCourse.NMACT === course.NMACT &&
            prevCourse.EJERC_MAX === course.EJERC_MAX
          ) {
            for (const key of CAMPOS_COMPETENCIAS)
              if (prevCourse[key])
                prevCourse[key] =
                  marks[
                    Math.max(
                      marks.indexOf(prevCourse[key]),
                      marks.indexOf('B1')
                    )
                  ]
          }
        }
      }

      /*  Cursos a distancia, Cursos Mixtos: 1.2 a A2, 1.4 a B1 */
      if (checkOnlineCourse(course)) {
        course['1.2'] =
          marks[Math.max(marks.indexOf(course['1.2']), marks.indexOf('A2'))]
        course['1.4'] =
          marks[Math.max(marks.indexOf(course['1.4']), marks.indexOf('B1'))]
      }

      /*  Si columna número de horas<10 horas: la competencia máxima es A2 en todos los campos donde haya salvo para tipo de participación Coordinadores y tutores */
      if (
        parseFloat(course.H) < 10 &&
        course.TIPO_PARTICIPACION !== 'TUTOR/A' &&
        course.TIPO_PARTICIPACION !== 'COORDINADOR/A'
      ) {
        for (const key of CAMPOS_COMPETENCIAS)
          if (course[key])
            course[key] =
              marks[Math.min(marks.indexOf(course[key]), marks.indexOf('A2'))]
      }

      /*  TIPO_PARTICIPACION Coordinador/a: 1.1, 1.2, 1.3, 1.4, 1.5 a B1 */

      if (checkCoordinator(course)) {
        for (const key of ['1.1', '1.2', '1.3', '1.4', '1.5'])
          course[key] =
            marks[Math.max(marks.indexOf(course[key]), marks.indexOf('B1'))]
      }

      /* 3.1, 3.2,  3.4 = C1 para tutores distancia o cursos mixtos */

      if (checkOnlineCourse(course) && course.TIPO_PARTICIPACION === 'TUTOR/A')
        course['3.1'] = course['3.2'] = course['3.4'] = 'C1'

      /* TIPO_PARTICIPACION Tutor/a: De las 23 en las que tenga etiqueta subirselas a C1, si no tiene ninguna no se le ponen.*/
      if (course.TIPO_PARTICIPACION === 'TUTOR/A') {
        for (const key of CAMPOS_COMPETENCIAS)
          if (course[key]) course[key] = 'C1'
      }

      /* Congreso o congresos o jornada o jornadas no asociar competencias digitales aunque haya palabras clave*/
      if (checkJornadaCongresos(course)) {
        for (const key of CAMPOS_COMPETENCIAS) if (course[key]) course[key] = ''
      }

      acc.push(course)
      return acc
    }, [])

    const postEvalFailCourses = failCDCCourses.map((course) => {
      /*  Cursos online: 1.1,  1.2, 1.4, 1.5 a A2 */
      if (checkOnlineCourse(course))
        course['1.1'] = course['1.2'] = course['1.4'] = course['1.5'] = 'A2'

      // /* TIPO_PARTICIPACION Tutor/a: De las 23 en las que tenga etiqueta subirselas a C1, si no tiene ninguna no se le ponen.*/
      // if (course.TIPO_PARTICIPACION === 'TUTOR/A') {
      //   course['1.1'] = course['1.2'] = course['1.4'] = course['1.5'] = 'A2'
      // }

      /* TIPO_PARTICIPACION Coordinador/a: De las 23 en las que tenga etiqueta subirselas a B1, si no tiene ninguna no se le ponen.*/
      if (checkCoordinator(course) && checkOnlineCourse(course)) {
        course['1.1'] = course['1.2'] = course['1.4'] = course['1.5'] = 'B1'
      }

      /* 1.1, 1.2, 1.4, 1.5, 3.1, 3.2,  3.4 = C1 para tutores distancia o cursos mixtos */
      if (checkOnlineCourse(course) && course.TIPO_PARTICIPACION === 'TUTOR/A')
        course['1.1'] =
          course['1.2'] =
          course['1.4'] =
          course['1.5'] =
          course['3.1'] =
          course['3.2'] =
          course['3.4'] =
            'C1'

      return course
    })

    /* now we separate data by centers */
    const sortByCenters = (prev, cur) => {
      const centro = removeDiacritics(String(cur.DCENTRO).trim()).toLowerCase()
      if (centers.includes(centro)) {
        if (!prev[cur.DCENTRO]) prev[cur.DCENTRO] = []
        prev[cur.DCENTRO].push(cur)
        return prev
      } else {
        if (!prev['OTROS CENTROS']) prev['OTROS CENTROS'] = []
        prev['OTROS CENTROS'].push(cur)
        return prev
      }
    }
    const evalCoursesByCenters = postEvalCourses.reduce(sortByCenters, {})
    const evalFailCoursesByCenters = postEvalFailCourses.reduce(
      sortByCenters,
      {}
    )

    /* generate Excels */
    await generateExcels(evalCoursesByCenters, io, CDC_CURSO)
    await generateExcels(evalFailCoursesByCenters, io, FAIL_CURSO)

    console.log('¡Hecho!')
    io.emit('status', jsonMsg('¡¡¡¡¡¡¡¡¡¡Hecho!!!!!!!!!', false))
    res.status(200).json(currentData)
  } catch (err) {
    io.emit('status', jsonMsg(err.message, false, err.message))
    console.log(err)
    res.status(500).json({ err: err.message, ...currentData })
  }
}

const generateExcels = async (courses, io, type) => {
  /*  now generate excel docs per center */
  // await Promise.all(
  //   Object.keys(courses).map(async (key) => {
  //     const coursesByCenter = courses[key]
  //     const sortCenters = coursesByCenter.map(center =>  {
  //       delete center.grupos;
  //       return center
  //     })
  //     return await generateExcel(sortCenters, key)
  //   })
  // )
  if (type === CDC_CURSO) {
    io.emit('status', jsonMsg(`Procesando cursos con competencias digitales:`))
  } else {
    io.emit('status', jsonMsg(`Procesando cursos sin competencias digitales:`))
  }

  for (const key of Object.keys(courses)) {
    const coursesByCenter = courses[key]
    const sortCenters = coursesByCenter.map((center) => {
      delete center.grupos
      return center
    })
    // not promise.all and sleep to avoid error:
    // Quota exceeded for quota metric 'Write requests' and limit 'Write requests per minute per user' of service 'sheets.googleapis.com' for consumer 'project_number:384235499704
    await sleep(3000)
    await generateExcel(sortCenters, key, io, type)
  }
}

const generateExcel = async (center, title, io, type) => {
  console.log(`Añadiendo hoja para centro ${title}`)
  io.emit('status', jsonMsg(`- Añadiendo hoja para centro ${title}`))
  let doc
  if (type === CDC_CURSO) {
    doc = ENV
      ? '1cEH33xguGD9WFWJRG8mpveRHfFDkcG8G_1GuWVqzdKg'
      : '17xe-oA8pJz6YoMiqAM9aGpLaMNghgb13nCL-ko2RKsc'
  } else {
    doc = ENV
      ? '1uJvJPseh664FvwXlVFUEXzzaUrGXKg23QeAsKC7PlcM'
      : '1sttPpxvvVC-BPiZAzeUd9EyDvK9XYFpdhNStKf2wkZU'
  }
  const resultado = new GoogleSpreadsheet(doc)
  await resultado.useServiceAccountAuth(creds)
  await resultado.loadInfo()
  if (resultado.sheetsByTitle[title]) {
    const sheetId = resultado.sheetsByTitle[title]._rawProperties.sheetId
    await resultado.deleteSheet(sheetId)
  }

  // const orderKeys  = Object.keys(center[0]).sort((a,b)=> a - b)
  const orderCourses = center.map((course) =>
    fields.reduce((obj, key) => {
      obj[key] = course[key]
      return obj
    }, {})
  )

  const centerData = orderCourses.map((item) => Object.values(item))
  const centerSheet = await resultado.addSheet({
    title,
    // headerValues: orderKeys,
    // gridProperties:  { rowCount: centerData.length, columnCount: 50 }
  })
  //
  await centerSheet.resize({
    rowCount: centerData.length + 2,
    columnCount: fields.length,
  })
  await centerSheet.setHeaderRow(fields)
  await centerSheet.addRows(centerData)
  console.log(
    `Añadida hoja para centro ${title}  con ${centerData.length} filas`
  )
  io.emit(
    'status',
    jsonMsg(
      `- Añadida hoja para centro ${title}  con ${centerData.length} filas`
    )
  )
}

module.exports = {
  generateSheet,
}
