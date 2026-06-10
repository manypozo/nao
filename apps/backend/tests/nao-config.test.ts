import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { extractConfiguredRepos } from '../src/utils/nao-config';

describe('extractConfiguredRepos', () => {
	it('returns repos declared in nao_config.yaml with GitHub metadata', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nao-config-'));
		try {
			fs.writeFileSync(
				path.join(dir, 'nao_config.yaml'),
				[
					'project_name: demo',
					'repos:',
					'  - name: dbt-models',
					'    url: https://github.com/nao/dbt-models.git',
					'    branch: main',
					'  - name: local-docs',
					'    local_path: ../docs',
				].join('\n'),
			);

			expect(extractConfiguredRepos(dir)).toEqual([
				{
					branch: 'main',
					contextPath: 'repos/dbt-models',
					localPath: null,
					name: 'dbt-models',
					repoFullName: 'nao/dbt-models',
					url: 'https://github.com/nao/dbt-models.git',
				},
				{
					branch: null,
					contextPath: 'repos/local-docs',
					localPath: '../docs',
					name: 'local-docs',
					repoFullName: null,
					url: null,
				},
			]);
		} finally {
			fs.rmSync(dir, { force: true, recursive: true });
		}
	});
});
