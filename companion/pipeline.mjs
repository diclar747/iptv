import { randomBytes } from 'node:crypto';

export class ImportPipeline {
 constructor({ claim, run, onError = () => {} }) {
  Object.assign(this, { claim, run, onError });
  this.tasks = new Map();
  this.worker = randomBytes(16).toString('hex');
  this.paused = false;
  this.polling = false;
 }

 snapshot() {
  return [...this.tasks.values()].map(task => ({ ...task.state, id: task.job.id }));
 }

 pause() {
  this.paused = true;
  for (const task of this.tasks.values()) task.controller.abort();
 }

 resume() {
  this.paused = false;
  void this.poll();
 }

 async poll() {
  if (this.paused || this.polling || this.tasks.size) return;
  this.polling = true;
  try {
   const { jobs } = await this.claim({ worker: this.worker, exclude: [], limit: 1, version: 2 });
   if (!this.paused && jobs?.[0]) this.start(jobs[0]);
  } catch (error) {
   await this.onError(error, null);
  } finally {
   this.polling = false;
  }
 }

 start(job) {
  const controller = new AbortController();
  const state = { title: job.title || job.url, phase: 'queued', message: 'Preparando descarga', progress: 0 };
  this.tasks.set(job.id, { job, controller, state });
  void Promise.resolve().then(() => this.run(job, controller, state))
   .catch(error => {
    if (!controller.signal.aborted) return this.onError(error, job);
   })
   .finally(() => {
    this.tasks.delete(job.id);
    void this.poll();
   });
 }
}
