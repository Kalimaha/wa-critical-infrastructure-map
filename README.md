# WA critical infrastructure map

A study case for an interactive web map of WA's critical infrastructure: police stations, prisons, roads and airports. WIP available [here](https://wa-critical-infrastructure-map.s3.ap-southeast-2.amazonaws.com/dist/index.html).

* [Documents](./docs/README.md)
* [Notebooks](./notebooks/README.md)

## Frontend development

Install the Playwright browser once before running Storybook tests:

```sh
npx playwright install chromium
```

Run the app or component workbench with `npm run dev` or `npm run storybook`.
Run checks with `npm test`, `npm run test-storybook`, and `npm run build-storybook`.
The Storybook `Ready` story loads the live PMTiles archive from S3 and requires network access.
 