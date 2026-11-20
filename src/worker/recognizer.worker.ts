import { env } from '@huggingface/transformers';
import { serve } from './handlers';

env.allowLocalModels = false;
env.useBrowserCache = true; // model files kept in Cache Storage after the first download

serve(self as unknown as Parameters<typeof serve>[0]);
