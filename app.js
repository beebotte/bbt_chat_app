var express = require( 'express' );
var path = require('path');

var bbt = require('beebotte');
var bclient = new bbt.Connector(
  {
    //keyId: process.env.AKEY, 
    //secretKey: process.env.SKEY,
  });

//Logging format - respect Apache's log format
var logFormat =  ':remote-addr - - [:date] ":method :url HTTP/:http-version" :status :res[content-length] :response-time ms ":referrer" ":user-agent"'

var app = express();

app.configure(function() {
  app.use(express.static(path.join(__dirname, 'client')));
  app.use(express.logger(logFormat));
  app.use(express.json());
  app.use(express.urlencoded());
  app.use(app.router);
});

app.get( '/auth', function( req, res, next) {
  var channel = req.query.channel,
  resource = req.query.resource || '*',
  ttl = req.query.ttl || 0,
  read = req.query.read || false,
  write = req.query.write || false,
  sid = req.query.sid;
  if( !sid || !channel ) return res.status(403).send('Unauthorized');

  var to_sign = sid + ':' + channel + '.' + resource + ':ttl=' + ttl + ':read=' + read + ':write=' + write;

  var auth = bclient.sign( to_sign );
  console.log(to_sign);
  console.log(auth);
  return res.send( auth );
} );

app.listen( process.env.PORT || 8000 ); 
