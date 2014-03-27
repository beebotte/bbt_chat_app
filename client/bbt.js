/*!
 * Beebotte client JavaScript library
 * Version 0.1.0
 * http://beebotte.com
 * Report issues to https://github.com/beebotte/bbt_node/issues
 * Contact email contact@beebotte.com
 *
 * Copyright 2014, Beebotte
 * MIT licence
 */

/************************************/

/**
 * Class: BBT
 * An object container for all Beebotte library functions.
 * 
 * @param key_id Access key associated with your Beebotte account
 * @param options optional parameters for initializing beebotte
 *   {
 *     auth_endpoint: authentication endpoint 
 *     auth_method: HTTP method (GET or POST) to be used for authentication purposes. Defaults to GET.
 *     server: URL to beebotte. default beebotte.com
 *     ssl: boolean - indicates whether ssl should be used. default false.
 *     username: string - assigns a friendly username
 *     cipher: cryptographic key for message data encryption. Defaults to no encryption.
 *   }
 */
BBT = function(key_id, options) {
  checkAppKey(key_id);
  this.key = key_id;
  options = options || {};

  this.initDefaults(); //Initialize default params
  this.updateParams(options);

  var self = this;

  this.instanceID = Math.floor(Math.random() * 1000000000); 
  BBT.instances.push(this);

  this.connection = new BBT.Connection(this);
  this.connect();

}

/*** Constant Values ***/
BBT.VERSION  = '0.1.0'; //Version of this client library
BBT.PROTO    = 1; //Version of Beebotte Protocol
BBT.ws_host  = 'ws.beebotte.com';
BBT.api_host = 'api.beebotte.com';
BBT.host     = 'beebotte.com';
BBT.port     = 80;  //Port for clear text connections
BBT.sec_port = 443; //Port for secure (TLS) connections

BBT.instances = [];

BBT.prototype.initDefaults = function() {
  this.ws_host  = BBT.ws_host;
  this.api_host = BBT.api_host;
  this.host     = BBT.host;
  this.port     = BBT.port;
  this.sport    = BBT.sport;

  this.ssl = false;
  this.auth_endpoint = null;
  this.auth_method = 'get';
  this.cipher = null;
  this.userinfo = {};
}

BBT.prototype.updateParams = function(params) {
  if(params.auth_endpoint) this.auth_endpoint = params.auth_endpoint;
  if(params.auth_method) this.auth_method = params.auth_method;
  if(params.username) this.userinfo.username = params.username;
  if(params.host) this.host = params.host;
  if(params.ws_host) this.ws_host = params.ws_host;
  if(params.api_host) this.api_host = params.api_host;
  if(params.port) this.port = params.port;
  if(params.sport) this.sport = params.sport;
  if(params.ssl) this.ssl = params.ssl;

  if(params.cipher) this.cipher = params.cipher;
}

BBT.prototype.getWsUrl = function() {
  var p = (this.ssl === true)? this.sport : this.port;
  return this.ws_host + ':' + p;
}

BBT.prototype.getApiUrl = function() {
  var p = (this.ssl === true)? this.sport : this.port;
  return ((this.ssl === true)? 'https://' : 'http://' ) + this.api_host + ':' + p;
}

BBT.Connection = function(bbt) {
  this.bbt = bbt;
  this.connected = false;
  this.connection = null;
  this.channels = new BBT.Channels();

}

BBT.Connection.prototype.onConnection = function() {
  for(c in this.channels.channels) {
    this.channels.channels[c].do_subscribe();
  }
}

BBT.Connection.prototype.connect = function () {
  var self = this;
  var query =  'key=' + this.bbt.key + '&username=' + (self.bbt.userinfo.username || '');
  this.connection = new io.connect(self.bbt.getWsUrl(), {query: query });
  
  this.connection.on('connect', function () {
    self.connected = true;
    //console.log(self.connection.socket.sessionid);
    //self.get_auth();
    self.onConnection();
  });

  this.connection.on('disconnect', function () {
    self.connected = false;
  });

  this.connection.on('message', function (msg) {
    
    if(msg.device && msg.service && msg.resource) {
      var channel = self.channels.get(msg.device, msg.service, msg.resource);
      if(channel) {
        channel.fct(msg);
      }else {
        //console.log('Warning! non subscribed message: ' + JSON.stringify(msg));
      }
    } else {
      //console.log('Warning! non conform message: ' + JSON.stringify(msg));
    }
  });
  
  this.connected = true; //TODO: this is not needed
}

BBT.Connection.prototype.disconnect = function () {
  this.connection.socket.disconnect();
}

//for internal use only
BBT.Connection.prototype.get_auth = function(device, service, resource) {
  var self = this;
  if(self.connected && self.bbt.auth_endpoint && self.connection && self.connection.socket && self.connection.socket.sessionid) {
    $.get( self.bbt.auth_endpoint, { sid: self.connection.socket.sessionid, device: device || '', service: service || '', resource: resource || '' } )
    .success(function( data ) {
      self.send_auth(data, {device: device, service: service, resource: resource});
    })
    .error(function(XMLHttpRequest, textStatus, errorThrown) { 
      //console.log('Unable to authenticate client');
    });
  }
}

//for internal use only
BBT.Connection.prototype.send_auth = function(sig, source) {
  var self = this;
  if(self.send('control', 'authenticate', {auth: sig.auth, source: source})) {
    this.authenticated = true;
    return true;
  }else {
    this.authenticated = false
    return false;
  }
}

BBT.Connection.prototype.subscribe = function(args, callback) {
  var channel = this.channels.get(args.device, args.service, args.resource);

  if(channel) {
    channel.update(args, callback);
  }else {
    channel = new BBT.Channel(args, callback, this.bbt);
    this.channels.add(channel);
    channel.do_subscribe();
  }
}


BBT.Connection.prototype.unsubscribe = function(args) {
  var channel = this.channels.get(args.device, args.service, args.resource);
  if(channel) {
    channel.unsubscribe();
    return this.send('control', 'unsubscribe', {device: args.device, service: args.service, resource: args.resource });
  }
  return true;
}

BBT.Connection.prototype.publish = function(args) {
  var channel = this.channels.getChannelWithPermission(args.device, args.service, args.resource, false, true);

  if(channel && channel.hasWritePermission()) {
    if(this.send('stream', 'emit', {device: args.device, service: args.service, resource: args.resource, data: args.data})) {
      return args.callback(null, {code: 0});
    }else {
      return args.callback({code: 11, message: 'Error while publishing message!'});
    }
  }
  return args.callback({code: 11, message: 'Permission error: cant\'t publish on the given resource!'});
}

BBT.Connection.prototype.write = function(args) {
  var channel = this.channels.getChannelWithPermission(args.device, args.service, args.resource, false, true);

  if(args.device.indexOf('private:') === 0) {
    //persistent messages have their own access levels (public or private). This overrides user indication
    args.device = args.device.substring(('private:').length());
  }

  if(channel && channel.hasWritePermission()) {
    if(this.send('stream', 'write', {device: args.device, service: args.service, resource: args.resource, data: args.data})) {
      return args.callback(null, {code: 0});
    }else {
      return args.callback({code: 11, message: 'Error while writing message!'});
    }
  }
  return args.callback({code: 11, message: 'Permission error: cant\'t write on the given resource!'});
}

//For internal use only    
BBT.Connection.prototype.send = function(cname, evt, data) {
  if(this.connection) {
    this.connection.json.send({version: BBT.Proto, channel: cname, event: evt, data: data});
    return true;
  }else {
    return false;
  }
}

BBT.Channels = function() {
  this.channels = [];
}
  
BBT.Channels.prototype.all = function() {
  return this.channels;
}
  
BBT.Channels.prototype.add = function(channel) {
  this.channels[channel.eid] = channel;
}

BBT.Channels.prototype.get = function(device, service, resource) {
  if(this.channels[device + '.' + service + '.' + resource]) return this.channels[device + '.' + service + '.' + resource];
  return null;
}

BBT.Channels.prototype.getAny = function(device, service, resource) {
  if(this.channels[device + '.' + service + '.' + resource]) return this.channels[device + '.' + service + '.' + resource];
  else if(this.channels[device + '.' + service + '.*']) return this.channels[device + '.' + service + '.*'];
  else if(this.channels[device + '.*' + '.*']) return this.channels[device + '.*' + '.*'];
  return null;
}

BBT.Channels.prototype.getChannelWithPermission = function(device, service, resource, read, write) {
  var channel = null;
  var match = false;
  if(channel = this.channels[device + '.' + service + '.' + resource]) {
    match = true;
    if(read) match = channel.hasReadPermission();
    if(write) match = channel.hasWritePermission();
    if(match) return channel;
  }else if(channel = this.channels[device + '.' + service + '.*']) {
    match = true;
    if(read) match = channel.hasReadPermission();
    if(write) match = channel.hasWritePermission();
    if(match) return channel;
  }else if(channel = this.channels[device + '.*' + '.*']) {
    match = true;
    if(read) match = channel.hasReadPermission();
    if(write) match = channel.hasWritePermission();
    if(match) return channel;
  }
  return null;
}

BBT.Channel = function(args, fct, bbt) {
  this.eid = args.device + '.' + args.service + '.' + args.resource;
  this.device = args.device;
  this.service = args.service;
  this.resource = args.resource;
  this.bbt = bbt;
  this.fct = fct;
  this.subscribed = false;
  this.write = args.write || false;
  this.read = args.read || false;
  this.writePermission = false;
  this.readPermission = false;
}

BBT.Channel.prototype.update = function(args) {

}

//Authentication required for write access and for read access to private or presence resources
BBT.Channel.prototype.authNeeded = function() {
  if(this.write === true) return true;
  if(this.device.indexOf('private:') === 0) return true;
  if(this.device.indexOf('presence:') === 0) return true;
  return false;
}

BBT.Channel.prototype.do_subscribe = function() {
  var self = this;
  if(!self.bbt.connection.connected) return;
  var connection = this.bbt.connection;

  var args = {};
  args.device = self.device;
  args.service = self.service || '*';
  args.resource = self.resource || '*';
  args.ttl = args.ttl || 0;
  args.read = self.read; 
  args.write = self.write;

  if(this.authNeeded()) {
    if(connection.connected && self.bbt.auth_endpoint && connection.connection && connection.connection.socket && connection.connection.socket.sessionid) {
      args.sid = connection.connection.socket.sessionid;
      if(connection.bbt.auth_method === 'get') {
        $.get( connection.bbt.auth_endpoint, args )
        .success(function( data ) {
          if(!data.auth) return console.log('Bad authentication reply');
          args.sig = data.auth;
          if(connection.send('control', 'subscribe', args)) {
            self.subscribe();
            return true;
          }else {
            return false;
          }
        })
        .error(function(XMLHttpRequest, textStatus, errorThrown) {
          return console.log('Unable to authenticate client');
        });
      }else if (connection.bbt.auth_method === 'post') {
        $.post( connection.bbt.auth_endpoint, args )
        .success(function( data ) {
          if(!data.auth) return console.log('Bad authentication reply');
          args.sig = data.auth;
          if(connection.send('control', 'subscribe', args)) {
            self.subscribe();
            return true;
          }else {
            return false;
          }
        })
        .error(function(XMLHttpRequest, textStatus, errorThrown) {
          return console.log('Unable to authenticate client');
        });
      }else {
        return console.log('Unsupported authentication method!');
      }
    }
  }else {
    if(connection.send('control', 'subscribe', args)) {
      self.subscribe();
      return true;
    }else {
      return false;
    }
  }
}

BBT.Channel.prototype.setReadPermission = function(){
  this.readPermission = true;
  this.read = true;
}

BBT.Channel.prototype.setWritePermission = function(){
  this.writePermission = true;
  this.write = true;
}

BBT.Channel.prototype.resetReadPermission = function(){
  this.readPermission = false;
  this.read = false;
}

BBT.Channel.prototype.resetWritePermission = function(){
  this.writePermission = false;
  this.write = false;
}

//Turns on the subscribed status of this channel with the given permissions
BBT.Channel.prototype.subscribe = function(){
  this.subscribed = true;
  if(this.read === true) this.setReadPermission();
  if(this.write === true) this.setWritePermission(); 
}

//Unsubscribes from the channel! this revoques any permission granted to the channel
BBT.Channel.prototype.unsubscribe = function() {
  this.subscribed = false;
  this.resetReadPermission();
  this.resetWritePermission();
}

//Returns true if the channel has write permission
BBT.Channel.prototype.hasWritePermission = function() {
  return this.writePermission;
}

//Returns true if the channel has read permission
BBT.Channel.prototype.hasReadPermission = function() {
  return this.readPermission;
}

function checkAppKey(key) {
  if (key === null || key === undefined) {
    BBT.warn(
      'Warning: You must pass your key id when you instantiate BBT.'
    );
  }
}

BBT.warn = function(msg) {
  if (window.console) {
    if (window.console.warn) {
      window.console.warn(message);
    } else if (window.console.log) {
      window.console.log(message);
    }
  }
  if (BBT.log) {
    BBT.log(message);
  }
};

BBT.error = function(err) {
  if(BBT.debug) throw new Error(msg);
}

/**
 * Sets the friendly username associated with this connection
 **/
BBT.prototype.setUsername = function(username) {
  this.userinfo.username = username;
}

/**
 * Connects this instance to the Beebotte platform if it is not connected. This method will be automatically called when creating a new instance of BBT.
 */
BBT.prototype.connect = function() {
  if(this.connection.connection) {
    var query =  'key=' + this.key + '&username=' + (this.userinfo.username || '');
    this.connection.connection.socket.options.query = query;
    this.connection.connection.socket.reconnect();
  }else {
    this.connection.connect();
  }
}

/**
 * Disconnets this beebotte instance. This will disconnect the websocket connection with beebotte servers.
 */
BBT.prototype.disconnect = function() {
  this.connection.disconnect();
}

/**
 * Sends a transient message to Beebotte. This method require prior 'write' permission on the specified resource (see BBT.grant method).
 * 
 * @param {Object} args: {
 *   {string, required} device name of the device. It can be prefixed with 'private:' to indicate a private resource.
 *   {string, required} service name of the service.
 *   {string, required} resource name of the resource.
 *   {Object, optional} data data message to publish to Bebotte.
 * }
 * @param {Object, optional} data data message to publish to Beebotte. If args.data is present, it will override this parameter.
 */
BBT.prototype.publish = function(args, data) {
  var vargs = {};
  vargs.device = args.device;
  vargs.service = args.service;
  vargs.resource = args.resource;
  vargs.data = args.data || data;
  vargs.callback = args.callback || function() {};

  if(!vargs.device) return BBT.error('Device not specified');
  if(!vargs.service) return BBT.error('Service not specified');
  if(!vargs.resource) return BBT.error('resource not specified');
  if(!(typeof vargs.device === 'string')) return BBT.error('Invalid format: device must be a string');
  if(!(typeof vargs.service === 'string')) return BBT.error('Invalid format: service must be a string');
  if(!(typeof vargs.resource === 'string')) return BBT.error('Invalid format: resource must be a string');
  if(!vargs.data) return BBT.error('Data message not specified');

  return this.connection.publish(vargs);
}

/**
 * Sends a presistent message to Beebotte. This method require prior 'write' permission on the specified resource (see BBT.grant method).
 * A resource with the specified parameters must exist for this method to succeed. In addition, the message will inherit the access level of the device. 
 * As the access level is specified by the existing device parameters, it is not necessary to add the 'private:' prefix. 
 *
 * @param {Object} args: {
 *   {string, required} device name of the device. It can be prefixed with 'private:' to indicate a private resource.
 *   {string, required} service name of the service.
 *   {string, required} resource name of the resource.
 *   {Object, optional} data data message to write to Bebotte.
 * }
 * @param {Object, optional} data data message to write to Beebotte. If args.data is present, it will override this parameter.  
 */
BBT.prototype.write = function(args, data) {
  var vargs = {};
  vargs.device = args.device;
  vargs.service = args.service;
  vargs.resource = args.resource;
  vargs.data = args.data || data;
  vargs.callback = args.callback || function() {};

  if(!vargs.device) return BBT.error('Device not specified');
  if(!vargs.service) return BBT.error('Service not specified');
  if(!vargs.resource) return BBT.error('resource not specified');
  if(!vargs.data) return BBT.error('Data message not specified');
  if(!(typeof vargs.device === 'string')) return BBT.error('Invalid format: device must be a string');
  if(!(typeof vargs.service === 'string')) return BBT.error('Invalid format: service must be a string');
  if(!(typeof vargs.resource === 'string')) return BBT.error('Invalid format: resource must be a string');

  return this.connection.write(vargs);
}

/**
 * Adds a callback listener to the specified resource that will called whenever a message associated with the same resource is published. If the 'device' parameter is prefixed by 'private:' or 'presence:', this method will automatically trigger the authentication mechanism.
 *
 * @param {Object} args: {
 *   {string, required} device name of the device. It can be prefixed with 'private:' to indicate a private resource, or it can be prefixed with 'presence:' to indicate presence events.
 *   {string, optional} service name of the service.
 *   {string, optional} resource name of the resource.
 *   {number, optional} ttl time in milliseconds during which the subscription will be active.
 *   {boolean, optional} read will be ignored. Considered always as true.
 *   {boolean, optional} write write permission requested along the subscription. This gives the possibility to publish or write messages to the specified resource. Defaults to false.
 * }
 * @param callback function to be called when a message is received.
 * @return true on success false on failure
 */  
BBT.prototype.subscribe = function(args, callback) {
  var vargs = {};
  var cbk = callback || args.callback;
  vargs.device = args.device;
  vargs.service = args.service || '*';
  vargs.resource = args.resource || '*';
  vargs.ttl = args.ttl || 0;
  vargs.read = args.read || true; //default true
  vargs.write = args.write === true; // default false

  if(!vargs.device) return BBT.error('Device not specified');
  if(!(typeof vargs.device === 'string')) return BBT.error('Invalid format: device must be a string');
  if(!(typeof vargs.service === 'string')) return BBT.error('Invalid format: service must be a string');
  if(!(typeof vargs.resource === 'string')) return BBT.error('Invalid format: resource must be a string');
  if(!(typeof vargs.ttl === 'number')) return BBT.error('Invalid format: ttl must be a number');
  if(!(typeof vargs.read === 'boolean')) return BBT.error('Invalid format: read element must be boolean');
  if(!(typeof vargs.write === 'boolean')) return BBT.error('Invalid format: write element must be boolean');
  if(vargs.read && !cbk) return BBT.error('Callback not specified. The callback parameter is mandatory for read operations');

  return this.connection.subscribe(vargs, cbk);
}

/**
 * Stops listenning to messages from the specified resource. 
 * 
 * @param {Object} args: {
 *   {string} device name of the device. It can be prefixed with 'private:' to indicate a private resource, or it can be prefixed with 'presence:' to indicate presence events.
 *   {string} service name of the service.
 *   {string} resource name of the resource.
 * }
 * @return true on success false on failure
 */
BBT.prototype.unsubscribe = function(args) {
  var vargs = {};
  vargs.device = args.device;
  vargs.service = args.service || '*';
  vargs.resource = args.resource || '*';

  if(!vargs.device) return BBT.error('Device not specified');
  if(!(typeof vargs.device === 'string')) return BBT.error('Invalid format: device must be a string');
  if(!(typeof vargs.service === 'string')) return BBT.error('Invalid format: service must be a string');
  if(!(typeof vargs.resource === 'string')) return BBT.error('Invalid format: resource must be a string');

  return this.connection.unsubscribe(vargs);
}

/** 
 * Sends a REST read request to Beebotte. This is a convenient API call to access the history of public persistent resources. 
 *
 * @param {Object} args: {
 *   {string, required} device name of the device. 
 *   {string, required} service name of the service.
 *   {string, required} resource name of the resource.
 *   {function, optional} callback callback function to be called with the response data
 *   {function, optional} callback callback function to be called with the response data. args.callback element will override this parameter if it is present.
 * }
 */
BBT.prototype.read = function(args, callback) {
  var limit = args.limit || 1;
  if(!args.owner) return BBT.error('Owner not specified');
  if(!args.device) return BBT.error('Device not specified');
  if(!args.service) return BBT.error('Service not specified');
  if(!args.resource) return BBT.error('resource not specified');
  if(!(typeof args.owner === 'string')) return BBT.error('Invalid format: owner must be a string');
  if(!(typeof args.device === 'string')) return BBT.error('Invalid format: device must be a string');
  if(!(typeof args.service === 'string')) return BBT.error('Invalid format: service must be a string');
  if(!(typeof args.resource === 'string')) return BBT.error('Invalid format: resource must be a string');
  if(!(typeof limit === 'number')) return BBT.error('Invalid format: limit must be a number');

  var cbk = args.callback || callback;

  if(!cbk) return BBT.error('Callback function not specified');

  $.get( this.getApiUrl() + '/api/public/resource', {owner: args.owner, device: args.device, service: args.service, resource: args.resource, limit: limit} )
    .success(function( data ) {
      if( cbk )
        cbk( null, data );
    })
    .error(function(XMLHttpRequest, textStatus, errorThrown) { 
      if( cbk )
        cbk ( {code: 11, message: 'Error'}, null );
    });
}


