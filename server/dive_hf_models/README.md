# dive_hf_models

Girder plugin that stores Hugging Face style model repositories and serves them to the browser at:

```
/api/v1/dive_hf_models/<org>/<repo>/resolve/<revision>/<file>
```

The Segment tool (SAM2 point-click) reads those URLs. The **DIVE HF Models** collection is created **public**, and it should stay public. That read access is how the system loads a model. Import still requires a Girder admin.

The `dive-hf-models` command downloads a repository, zips it, uploads the zip, and asks the server to extract it. It is installed with the server package. From this directory it is also a self-contained [uv](https://docs.astral.sh/uv/) script:

```bash
dive-hf-models --help
uv run cli.py --help
./cli.py --help
```

## Download

`download` only writes zip files. It does not talk to Girder. With no repository ids it downloads both Segment tool models, keeping the 4-bit weights (`q4`) plus root config files (`*.json`, `*.txt`, `*.model`):

```bash
dive-hf-models download
dive-hf-models download onnx-community/sam2.1-hiera-tiny-ONNX
```

Each zip is named `<org>__<repo>.zip` (for example `onnx-community__sam2.1-hiera-tiny-ONNX.zip`). Files sit at the repository root (`config.json`, `onnx/...`), and `dive_hf_model.json` records `repoId`, `revision`, `source`, `dtypes`, and `files`.

| Parameter | Environment | Default | Meaning |
|---|---|---|---|
| `REPO_IDS` | | both SAM2 models above | Hugging Face ids, `<org>/<repo>`. Repeat for more than one. |
| `--revision` | | `main` | Revision to download. |
| `--dtype` | | `q4` | ONNX weights to include. Repeat the flag for more than one. Values: `fp32`, `fp16`, `q4f16`, `q4`, `int8`, `uint8`, `bnb4`, `quantized`. `fp32` is an `.onnx` file with no dtype suffix. Matching `.onnx_data` sidecars are included. |
| `--include` | | | Extra glob, matched against the file path in the repository. Repeatable. |
| `--all` | | off | Every file in the repository. Ignores `--dtype` and `--include`. |
| `--hf-endpoint` | `HF_ENDPOINT` | `https://huggingface.co` | Hub base URL. |
| `--hf-token` | `HF_TOKEN` | | Token for a gated or private repository. |
| `-o`, `--out-dir` | | `.` | Directory for the zip files. |

## Upload

`upload` sends zip files, or a model directory, to Girder and extracts them into `DIVE HF Models/<org>/<repo>/`. A directory is zipped first (skipping `.git/`, `.cache/`, and `.gitattributes`). The zip is uploaded to your **Private** folder, extracted, then deleted.

```bash
dive-hf-models upload onnx-community__sam2.1-hiera-tiny-ONNX.zip --api-key <admin API key>
dive-hf-models upload ./sam2.1-hiera-tiny-ONNX --repo-id onnx-community/sam2.1-hiera-tiny-ONNX --api-key <key>
```

The server accepts a zip whose `config.json` is at the root, or under one `<repo>/` or `<org>/<repo>/` wrapper. The repository id comes from `--repo-id`, else `dive_hf_model.json`, else that `<org>/<repo>/` wrapper.

| Parameter | Environment | Default | Meaning |
|---|---|---|---|
| `PATHS` | | required | Zip files and/or model directories. |
| `--api-url` | `GIRDER_API_URL` | `http://localhost:8010/api/v1` | Girder REST API. |
| `--api-key` | `GIRDER_API_KEY` | | Admin API key. Used first. |
| `--token` | `GIRDER_TOKEN` | | Admin token. Used when no API key is set. |
| `--username` | `GIRDER_USERNAME` | prompted | Girder login. Used when no key or token is set. |
| `--password` | `GIRDER_PASSWORD` | prompted | Girder password. |
| `--repo-id` | | manifest or wrapper directory | `<org>/<repo>`. Only valid with a single path. |
| `--replace` | | off | Overwrite a model that is already stored. Without it, the import is refused. |
| `--folder-id` | | your Private folder | Girder folder that receives the zip before extraction. The zip is still deleted after a successful import. |

Sign-in must be an administrator. The order is `--api-key`, else `--token`, else username and password.

## sync and list

`sync` is `download` followed by `upload` for the same repositories. The zip is temporary and is not kept. It takes every download parameter and every upload parameter except `PATHS` and `--repo-id`.

```bash
dive-hf-models sync --api-url https://dive.example.org/api/v1 --api-key <admin API key>
dive-hf-models sync onnx-community/sam2.1-hiera-tiny-ONNX --dtype q4 --dtype fp16 --replace
```

`list` prints the repositories Girder is serving. It stays anonymous unless you pass credentials.

```bash
dive-hf-models list --api-url https://dive.example.org/api/v1
```

## Import without the command

Upload a zip in the Girder UI, then:

```
POST /api/v1/dive_hf_models/import?fileId=<file id>&repoId=<org>/<repo>&revision=main&replace=false&deleteZip=true
```

| Query | Default | Meaning |
|---|---|---|
| `fileId` | required | The uploaded zip. |
| `repoId` | manifest or `<org>/<repo>/` wrapper | Model id. |
| `revision` | manifest, else `main` | Recorded on the folder. The resolve URL accepts any revision and serves the imported files. |
| `replace` | `false` | Overwrite an existing model. |
| `deleteZip` | `true` | Delete the zip after a successful import. |
