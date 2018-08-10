# WP-JSON Compare

Use this repository to compare data across WP-JSON endpoints on two different sites. A scenario this would likely be used for is a full data migration.

## Setup

1. Do an `npm install`.
2. Update the `.env` file to specify the two sites you'd like to compare.

## Example Commands

`node taxonomy.js --endpoint=categories` -- Compare category objects
`node post.js --endpoint=posts --maxPages=3` -- Compare the first three pages of posts

Comparison results are saved to the `/logs/` folder.