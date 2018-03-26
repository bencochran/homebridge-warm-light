'use strict'

const convert = require('color-convert');

let Service, Characteristic;

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    
    homebridge.registerAccessory("homebridge-warm-lights", "WarmLights", WarmLights);
};

function WarmLights(log, config) {
    this.log = log;
    this.name = config['name'] || 'LED Controller';
    this.ip = config['ip'];
    
    this.hue = 360;
    this.saturation = 100;
    this.brightness = 100;
    
    this.getColorFromDevice();
}

WarmLights.prototype.identify = function(callback) {
    this.log('Identify requested!');
    callback();
};

WarmLights.prototype.getServices = function() {
    let informationService = new Service.AccessoryInformation();
    
    informationService
        .setCharacteristic(Characteristic.Manufacturer, 'ACME Ltd.')
        .setCharacteristic(Characteristic.Model, 'LED-controller')
        .setCharacteristic(Characteristic.SerialNumber, '123456789');
    
    let lightbulbService = new Service.Lightbulb(this.name);
    
    lightbulbService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getPowerState.bind(this))
        .on('set', this.setPowerState.bind(this));

    lightbulbService
        .addCharacteristic(new Characteristic.Hue())
        .on('get', this.getHue.bind(this))
        .on('set', this.setHue.bind(this));

    lightbulbService
        .addCharacteristic(new Characteristic.Saturation())
        .on('get', this.getSaturation.bind(this))
        .on('set', this.setSaturation.bind(this));

    lightbulbService
        .addCharacteristic(new Characteristic.Brightness())
        .on('get', this.getBrightness.bind(this))
        .on('set', this.setBrightness.bind(this));

    return [informationService, lightbulbService];
};

WarmLights.prototype.sendCommand = function(command, callback) {
    var exec = require('child_process').exec;
    var cmd = 'flux_led ' + this.ip + ' ' + command;
    exec(cmd, callback);
};

WarmLights.prototype.getState = function (callback) {
    this.sendCommand('-i', function(error, stdout) {
        const settings = {
            on: false,
            hue: 360,
            saturation: 100,
            brightness: 100
        };

        const colors = stdout.match(/Color: \(\d{3}\, \d{3}, \d{3}\)/g);
        const white = stdout.match(/White: \d{3}/);
        const isOn = stdout.match(/\] ON /g);

        if (isOn && isOn.length > 0) {
            settings.on = true;
        }

        if (colors && colors.length > 0) {
            // TODO: Use the reverse of the below conversion here (instead of `convert`)
            var converted = convert.rgb.hsl(stdout.match(/\d{3}/g));
            settings.hue = converted[0];
            settings.saturation = converted[1];
            settings.brightness = converted[2];
        }

        callback(settings);
    });
};

// MARK: - COLOR

WarmLights.prototype.getColorFromDevice = function() {
    this.getState(function(settings) {
        this.color = settings.color;
        this.hue = settings.hue;
        this.saturation = settings.saturation;
        this.log("DEVICE COLOR: %s", settings.hue+','+settings.saturation+','+settings.brightness);
    }.bind(this));
};

WarmLights.prototype.setToCurrentColor = function() {
    let hue = Math.PI * this.hue / 180.0; // to radians
    let saturation = this.saturation / 100.0; // to [0, 1]
    let brightness = this.brightness / 100.0; // [0, 1]

    // Based on information and code from
    // blog.saikoled.com/post/44677718712/how-to-convert-from-hsi-to-rgb-white
    //
    // Rotate the hue around so we’re always operating with one element at zero
    
    const firstThird = Math.PI * 2.0 / 3.0;
    const secondThird = Math.PI * 4.0 / 3.0;
    
    let offset = 0;
    if (hue < firstThird) {
        offset = 0;
    } else if (hue < secondThird) {
        hue = hue - firstThird;
        offset = 2;
    } else {
        hue = hue - secondThird;
        offset = 1;
    }
    
    let colors = [
        saturation * 255.0 * brightness / 3.0 * (1 + Math.cos(hue) / Math.cos(1.047196667 - hue)),
        saturation * 255.0 * brightness / 3.0 * (1 + (1 - Math.cos(hue) / Math.cos(1.047196667 - hue))),
        0.0
    ];
    
    const red = Math.round(colors[(0 + offset) % 3]);
    const green = Math.round(colors[(1 + offset) % 3]);
    const blue = Math.round(colors[(2 + offset) % 3]);
    const white = Math.round(255.0 * (1.0 - saturation) * brightness);
    
    this.sendCommand('-c ' + red + ',' + green + ',' + blue + ',' + white);
};

// MARK: - POWERSTATE

WarmLights.prototype.getPowerState = function(callback) {
    this.getState(function(settings) {
        callback(null, settings.on);
    });
};

WarmLights.prototype.setPowerState = function(value, callback) {
    this.sendCommand(value ? '--on' : '--off', function() {
        callback();
    });
};


// MARK: - HUE

WarmLights.prototype.getHue = function(callback) {
    callback(null, this.hue);
};

WarmLights.prototype.setHue = function(value, callback) {
    this.hue = value;
    this.log("SET HUE: %s", value);
    this.setToCurrentColor();

    callback();
};

// MARK: - BRIGHTNESS

WarmLights.prototype.getBrightness = function(callback) {
    var brightness = this.brightness;
    callback(null, brightness);
};

WarmLights.prototype.setBrightness = function(value, callback) {
    this.brightness = value;
    this.log("SET BRIGHTNESS: %s", value);
    this.setToCurrentColor();
    callback();
};

// MARK: - SATURATION

WarmLights.prototype.getSaturation = function(callback) {
    callback(null, this.saturation);
};

WarmLights.prototype.setSaturation = function(value, callback) {
    this.saturation = value;
    this.log("SET SATURATION: %s", value);
    this.setToCurrentColor();

    callback();
};
