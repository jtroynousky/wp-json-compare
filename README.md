# WP-JSON Compare

Use this repository to compare data across WP-JSON endpoints on two different sites. A scenario this would likely be used for is a full data migration.

## Setup

1. Do an `npm install`.
2. Update the `.env` file to specify the two sites you'd like to compare.

## Example Commands

`node taxonomy.js` -- Compare category objects

Comparison results are saved to the `/logs/` folder.