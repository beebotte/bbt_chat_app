var express = require( 'express' );
var path = require('path');
var morgan = require('morgan')
var serveStatic = require('serve-static')

var bbt = require('beebotte');
var bclient = new bbt.Connector(
{
  //Don't forget to provide you access keys!
  keyId: process.env.keyId,
  secretKey: process.env.secretKey,
});

var app = express();

app.use(morgan('combined'))
app.use(serveStatic(__dirname + '/client', {'index': ['chat.html']}))

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

app.listen( process.env.PORT || 8080 ); 
