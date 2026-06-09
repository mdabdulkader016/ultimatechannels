// Build a 1024x1024 source logo (centered, padded) for @capacitor/assets.
const sharp = require('sharp')
const fs = require('fs')

;(async () => {
  fs.mkdirSync('resources', { recursive: true })
  const logo = await sharp('public/Ulimate-Channels-Logo.png')
    .resize(780, 780, { fit: 'inside', withoutEnlargement: true })
    .toBuffer()
  const square = await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer()
  fs.writeFileSync('resources/logo.png', square)
  fs.writeFileSync('resources/logo-dark.png', square)
  console.log('Created resources/logo.png (1024x1024)')
})().catch((e) => { console.error(e); process.exit(1) })
