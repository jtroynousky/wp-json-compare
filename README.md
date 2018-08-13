# WP-JSON Compare

Use this repository to compare data across WP-JSON endpoints on two different sites. A scenario this would likely be used for is a full data migration.

## Setup

1. `npm install`.

## Example Commands

`node wp-json-compare.js --model=post --siteA=http://somesite.com --siteB=https://anothersite.org`
`node wp-json-compare.js --model=categories --siteA=http://somesite.com --siteB=https://anothersite.org`

Comparison results are saved to the `/logs/` folder.