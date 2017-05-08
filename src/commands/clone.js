var fs = require('fs')
var rimraf = require('rimraf')
var Dat = require('dat-node')
var linkResolve = require('dat-link-resolve')
var neatLog = require('neat-log')
var output = require('neat-log/output')
var archiveUI = require('../ui/archive')
var trackArchive = require('../lib/archive')
var onExit = require('../lib/exit')
var debug = require('debug')('dat')

module.exports = {
  name: 'clone',
  command: clone,
  help: [
    'Clone a remote Dat archive',
    '',
    'Usage: dat clone <link> [download-folder]'
  ].join('\n'),
  options: [
    {
      name: 'upload',
      boolean: true,
      default: false,
      help: 'upload data to other peers while cloning'
    }
  ]
}

function clone (opts) {
  opts.key = opts._[0]
  opts.dir = opts.dir || opts._[1]

  debug('clone()')
  debug(Object.assign({}, opts, {key: '<private>', _: null})) // don't show key

  var neat = neatLog(archiveUI, { logspeed: opts.logspeed, quiet: opts.quiet })
  neat.use(trackArchive)
  neat.use(onExit)
  neat.use(function (state, bus) {
    if (!opts.key) return bus.emit('exit:warn', 'key required to clone')

    state.opts = opts
    var createdDirectory = null // so we can delete directory if we get error

    // Force these options for clone command
    opts.exit = (opts.exit !== false)
    // opts.errorIfExists = true // TODO: do we want to force this?

    linkResolve(opts.key, function (err, key) {
      if (err && err.message.indexOf('Invalid key') === -1) return bus.emit('exit:error', 'Could not resolve link')
      else if (err) return bus.emit('exit:warn', 'Link is not a valid Dat link.')

      opts.key = key
      createDir(opts.key, function () {
        bus.emit('key', key)
        runDat()
      })
    })

    function createDir (dir, cb) {
      debug('Creating directory for clone', dir)
      // Create the directory if it doesn't exist
      // If no dir is specified, we put dat in a dir with name = key
      if (!opts.dir || opts.dir === process.cwd()) {
        opts.dir = dir
      }
      try {
        fs.accessSync(opts.dir, fs.F_OK)
        createdDirectory = false
      } catch (e) {
        createdDirectory = true
        fs.mkdirSync(opts.dir)
      }
      cb()
    }

    function runDat () {
      Dat(opts.dir, opts, function (err, dat) {
        if (err && err.name === 'ExistsError') return bus.emit('exit:warn', 'Existing archive in this directory. Use pull or sync to update.')
        if (err) {
          if (createdDirectory) rimraf.sync(dat.path)
          return bus.emit('exit:error', err)
        }
        if (dat.writable) return bus.emit('exit:warn', 'Archive is writable. Cannot clone your own archive =).')

        state.dat = dat
        state.title = 'Cloning'
        bus.emit('dat')
        bus.emit('render')

        bus.once('network:callback', function () {
          if (!dat.network.connected) {
            var msg = output`
              Dat could not find any connections for that link.
              There may not be any sources online.

              Run 'dat doctor' if you keep having trouble.
            `
            bus.emit('exit:warn', msg)
          }
        })
      })
    }
  })
}
