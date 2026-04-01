# BOQ Workflow App

A React + Vite dashboard for managing bill of quantities (BOQ) workflows across planning, engineering, site, procurement, and vendor teams.

## Overview

This project is a modern single-page application built with React, Vite, Recharts, and XLSX. It enables multiple user roles to:

- create and manage BOQs
- review pending BOQs by engineering, QS, and site teams
- track procurement activity and vendor interactions
- import Excel-based BOQs with intelligent column parsing
- visualize BOQ data and workflow status using charts

## Key Features

- Role-based navigation for planning, engineering, QS, site, procurement, and vendor users
- Excel upload support via the `xlsx` package
- Interactive dashboards and reports using `recharts`
- Responsive UI with dark theme styling
- Built for fast development with Vite

## Installation

1. Clone the repository

```bash
git clone <your-repo-url>
cd hackathon
```

2. Install dependencies

```bash
npm install
```

3. Run locally

```bash
npm run dev
```

Then open the local development server URL shown in the terminal.

## Build and Deployment

Build the production files:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

Deploy to GitHub Pages:

```bash
npm run deploy
```

> The `homepage` field is configured for: `https://supersaif08.github.io/hackathon`

## Dependencies

- `react`
- `react-dom`
- `vite`
- `@vitejs/plugin-react`
- `recharts`
- `xlsx`
- `gh-pages`

## Notes

- This app is currently configured as a private Vite project.
- The deployment script uses `gh-pages -d dist` to publish the build output.
- If `node_modules` appears in source control, add it to `.gitignore` and avoid committing it.

## License

This repository is provided as-is for the BOQ workflow application demo.
