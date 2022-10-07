const router = require('express').Router()

const returnRouter = (io) => {
  const sheetController = require('./sheetController')
  router.get('/:test?', (req, res) =>
    sheetController.generateSheet(req, res, io)
  )
  return router
}

module.exports = returnRouter
