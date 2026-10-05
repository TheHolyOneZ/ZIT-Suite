export interface WorkflowTemplate {
  id: "blank" | "ci-node" | "ci-rust" | "ci-python" | "release-files" | "pages" | "manual";
  file: string;
  content: string;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "blank",
    file: "my-workflow.yml",
    content: `name: My workflow
on:
  workflow_dispatch:

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Hello from GitHub Actions"
`,
  },
  {
    id: "ci-node",
    file: "ci.yml",
    content: `name: CI
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build --if-present
      - run: npm test --if-present
`,
  },
  {
    id: "ci-rust",
    file: "ci.yml",
    content: `name: CI
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

env:
  CARGO_TERM_COLOR: always

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
      - run: cargo build --locked
      - run: cargo test --locked
`,
  },
  {
    id: "ci-python",
    file: "ci.yml",
    content: `name: CI
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r requirements.txt || true
      - run: pip install pytest && pytest || echo "no tests yet"
`,
  },
  {
    id: "release-files",
    file: "release-files.yml",
    content: `name: Attach source zip to releases
on:
  release:
    types: [published]

permissions:
  contents: write

jobs:
  attach:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Package
        run: |
          mkdir -p dist
          git archive --format=zip -o "dist/\${{ github.event.repository.name }}-\${{ github.event.release.tag_name }}.zip" HEAD
      - name: Upload to the release
        env:
          GH_TOKEN: \${{ github.token }}
        run: gh release upload "\${{ github.event.release.tag_name }}" dist/* --clobber
`,
  },
  {
    id: "pages",
    file: "pages.yml",
    content: `name: Publish website (GitHub Pages)
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - id: deployment
        uses: actions/deploy-pages@v4
`,
  },
  {
    id: "manual",
    file: "manual-task.yml",
    content: `name: Manual task
on:
  workflow_dispatch:
    inputs:
      environment:
        description: Where to run it
        type: choice
        options: [staging, production]
        default: staging
      dry_run:
        description: Only print what would happen
        type: boolean
        default: true
      note:
        description: Anything to pass along
        type: string
        required: false

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          echo "Environment: \${{ inputs.environment }}"
          echo "Dry run: \${{ inputs.dry_run }}"
          echo "Note: \${{ inputs.note }}"
`,
  },
];
