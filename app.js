var express = require( 'express' );
var path = require('path');

var bbt = require('beebotte');
var bclient = new bbt.Connector(
  {
    keyId: process.env.AKEY, 
    secretKey: process.env.SKEY,
  });

//Logging format - respect Apache's log format
var logFormat =  ':remote-addr - - [:date] ":method :url HTTP/:http-version" :status :res[content-length] :response-time ms ":referrer" ":user-agent"'

var app = express();

app.configure(function() {
  app.use(express.static(path.join(__dirname, 'client')));
  app.use(express.logger(logFormat));
  app.use(express.json());
  app.use(express.urlencoded());
});

app.get( '/auth', function( req, res, next) {
  var device = req.query.device,
  service = req.query.service || '*',
  resource = req.query.resource || '*',
  ttl = req.query.ttl || 0,
  read = req.query.read || false,
  write = req.query.write || false,
  sid = req.query.sid;
  if( !sid || !device ) return res.status(403).send('Unauthorized');
  
  var to_sign = sid + ':' + device + '.' + service + '.' + resource + ':ttl=' + ttl + ':read=' + read + ':write=' + write;
  
  var auth = bclient.sign( to_sign );
  console.log(to_sign);
  console.log(auth);
  return res.send( auth );
} );

app.post( '/chat', function( req, res, next ) {
  console.log(req.body.msg.length);
  if( !req.body.msg ) return next(new Error('Bad Request').http_code(400));
  var src = req.body.src || 'anonymous';
  bclient.sendEvent({channel: 'bbt_chat_demo', event: 'msg', data: {src: src, msg: req.body.msg}}, function(err, res) {
    if(err) console.log(err);
    console.log(res);
  });
  res.send( 'true' );

});

app.listen( process.env.PORT || 8000 ); 
