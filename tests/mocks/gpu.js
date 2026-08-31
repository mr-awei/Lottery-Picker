// vitest 环境下的 gpu.js mock：测试只走 CPU 评分路径，不实例化 GPU
export class GPU {
  constructor() {
    throw new Error('[vitest mock] GPU 实例化在测试环境中被禁用，请使用 CPU 路径')
  }
}
