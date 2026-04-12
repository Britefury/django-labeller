import * as esbuild from 'esbuild';
import process from 'process';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const labeller_only = args.includes('--labeller');
const schema_only = args.includes('--schema');

const labeller_config = {
    entryPoints: ['ui/labelling_tool/index.ts'],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    outfile: 'image_labelling_tool/static/labelling_tool/labelling_tool.bundle.js',
    sourcemap: true,
};

const schema_config = {
    entryPoints: ['ui/schema_editor/schema_editor.ts'],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    outfile: 'image_labelling_tool/static/schema_editor/schema_editor.bundle.js',
    sourcemap: true,
};

const configs = [];
if (!schema_only) configs.push(labeller_config);
if (!labeller_only) configs.push(schema_config);

if (watch) {
    const contexts = await Promise.all(configs.map(c => esbuild.context(c)));
    await Promise.all(contexts.map(ctx => ctx.watch()));
    console.log('Watching for changes...');
} else {
    await Promise.all(configs.map(c => esbuild.build(c)));
    console.log('Build complete.');
}
