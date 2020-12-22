const { generateSWString } = require('workbox-build')
const { readFile, writeFileSync } = require('fs')
const logger = require('@parcel/logger')
const path = require('path')
const uglifyJS = require('terser');

const workboxConfig = require( '../../.workbox-config.js' )

module.exports = bundle => {
  bundle.on('buildEnd', async () => {
    // output path
    let pathOut = bundle.options.outDir
    const fileFormats = 'css,html,js,gif,ico,jpg,png,svg,webp,woff,woff2,ttf,otf'
    const DEFAULT_CONFIG = {
      // scripts to import into sw
      importScripts: ['./worker.js'],
      // directory to include
      globDirectory: bundle.options.outDir,
      // file types to include
      globPatterns: [`**/*.{${fileFormats}}`]
    }

    let pkg
    let mainAsset =
      bundle.mainAsset ||
      bundle.mainBundle.entryAsset ||
      bundle.mainBundle.childBundles.values().next().value.entryAsset

    pkg = typeof mainAsset.getPackage === 'function' ? await mainAsset.getPackage() : mainAsset.package

    let config = Object.assign({}, workboxConfig ? workboxConfig : DEFAULT_CONFIG)

    if (pkg.workbox) {
      if (pkg.workbox.importScripts && Array.isArray(pkg.workbox.importScripts)) {
        config.importScripts = pkg.workbox.importScripts
      }
      if (pkg.workbox.importScripts && !Array.isArray(pkg.workbox.importScripts)) {
        config.importScripts = [pkg.workbox.importScripts]
      }
      if (pkg.workbox.globDirectory) config.globDirectory = pkg.workbox.globDirectory
      config.globDirectory = path.resolve(config.globDirectory)
      if (pkg.workbox.globPatterns && Array.isArray(pkg.workbox.globPatterns)) {
        config.globPatterns = pkg.workbox.globPatterns
      }
      if (pkg.workbox.globPatterns && !Array.isArray(pkg.workbox.globPatterns)) {
        config.globPatterns = [pkg.workbox.globPatterns]
      }
      if (pkg.workbox.pathOut) pathOut = pkg.workbox.pathOut
    }
    const dest = path.resolve(pathOut)

    logger.log('🛠️  Workbox')
    config.importScripts.forEach(s => {
      readFile(path.resolve(s), (err, data) => {
        if (err) throw err
        if (bundle.options.minify) {
          data = uglifyJS.minify(data).code
        }
        const impDest = path.resolve(pathOut, /[^\/]+$/.exec(s)[0])
        writeFileSync(impDest, data)
        logger.log(`Imported ${s} to ${impDest}`)
      })
    })

    config.importScripts = config.importScripts.map(s => {
      return /[^\/]+$/.exec(s)[0]
    })
    config.importScripts.unshift('https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-sw.js')

    generateSWString(config)
      .then(swString => {
        swString = swString.swString
        logger.log('Service worker generated')
        if (bundle.options.minify) {
          swString = uglifyJS.minify(swString).code
          logger.log('Service worker minified')
        }
        writeFileSync(path.join(dest, 'sw.js'), swString)
        logger.log(`Service worker written to ${dest}/sw.js`)
      })
      .catch(err => {
        logger.error(err)
      })

    const entry = path.resolve(pathOut, 'index.html')
    readFile(entry, 'utf8', (err, data) => {
      if (err) logger.error(err)
      if (!data.includes('serviceWorker.register')) {
        let swTag = `
        if ('serviceWorker' in navigator) {
          window.addEventListener('load', function() {
            navigator.serviceWorker.register('/sw.js');
          });
        }
      `
        if (bundle.options.minify) {
          swTag = uglifyJS.minify(swTag)
          swTag = `<script>${swTag.code}</script></body>`
        } else {
          swTag = `
        <script>
        ${swTag}
        </script>
      </body>`
        }
        data = data.replace('</body>', swTag)
        writeFileSync(entry, data)
        logger.log(`Service worker injected into ${dest}/index.html`)
      }
    })
  })
}
