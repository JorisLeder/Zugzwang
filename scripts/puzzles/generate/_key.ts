import { cacheDir } from './pool';
import { DEFAULT_GENERATOR_CONFIG } from './selfplay';
console.log(cacheDir(process.cwd(), Number(process.argv[2] ?? 1), DEFAULT_GENERATOR_CONFIG));
