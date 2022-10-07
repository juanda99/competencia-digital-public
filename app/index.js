// dependencies

const express = require('express')
const { createServer } = require('http')
const { Server } = require('socket.io')
const cors = require('cors')

const app = express()
app.use(cors())
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: [
      'http://localhost:3000',
      'https://competencias.catedu.es',
      'http://competencias.catedu.es',
    ],
    methods: ['GET', 'POST'],
  },
})

const router = require('./routes')(io)

/*
var allowedOrigins = ['http://localhost:3000',
                      'http://yourapp.com'];
app.use(cors({
  origin: function(origin, callback){
    // allow requests with no origin 
    // (like mobile apps or curl requests)
    if(!origin) return callback(null, true);
    if(allowedOrigins.indexOf(origin) === -1){
      var msg = 'The CORS policy for this site does not ' +
                'allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
}));
*/

app.use('/', router)
const port = +process.argv[2] || +process.env.PORT || 7262
httpServer.listen(port, function () {
  console.log('Serving HTTP on port ' + port)
})
