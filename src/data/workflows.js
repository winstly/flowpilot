// 工作流定义（纯定义：节点 / 连线 / 审查问题；执行状态与日志由真实运行产生，不预置 mock）
// lane: input 首节点✦ / core 处理 Bot / output 尾节点✓
// edges: [from, to] 显式连线，支持并行分支（Dify 式画布布局）
export const workflows = [
  {
    "id": "wf-weekly",
    "name": "市场竞品周报生成",
    "category": "流程编排",
    "desc": "聚合竞品动态，清洗分析后生成周度报告并推送",
    "edges": [
      [
        "n1",
        "n2"
      ],
      [
        "n2",
        "n3"
      ],
      [
        "n3",
        "n3r"
      ],
      [
        "n3r",
        "n4"
      ],
      [
        "n4",
        "n5"
      ]
    ],
    "nodes": [
      {
        "id": "n1",
        "lane": "input",
        "name": "收集竞品动态",
        "agent": "数据采集 Bot"
      },
      {
        "id": "n2",
        "lane": "core",
        "name": "竞品数据清洗",
        "agent": "数据清洗 Bot"
      },
      {
        "id": "n3",
        "lane": "core",
        "name": "多维度对比分析",
        "agent": "分析 Bot"
      },
      {
        "id": "n3r",
        "lane": "core",
        "name": "人工审查：对比结论",
        "agent": "用户审查",
        "type": "review",
        "review": {
          "questions": [
            {
              "id": "q1",
              "q": "对比结论是否采信，可进入图表生成？",
              "options": [
                "采信，按当前结论继续",
                "采信，但需补充竞品 D 数据",
                "不采信，重新抓取分析"
              ],
              "answer": null
            }
          ]
        }
      },
      {
        "id": "n4",
        "lane": "core",
        "name": "深度循环分析",
        "agent": "分析 Bot"
      },
      {
        "id": "n5",
        "lane": "output",
        "name": "生成周报并推送",
        "agent": "报告 Bot"
      }
    ]
  },
  {
    "id": "wf-prd",
    "name": "PRD 需求评审助手",
    "category": "研究分析",
    "desc": "对 PRD 做结构化预审，输出风险清单与建议",
    "edges": [
      [
        "n1",
        "n2"
      ],
      [
        "n2",
        "n3"
      ],
      [
        "n3",
        "n4"
      ]
    ],
    "nodes": [
      {
        "id": "n1",
        "lane": "input",
        "name": "解析 PRD 文档",
        "agent": "文档解析 Bot"
      },
      {
        "id": "n2",
        "lane": "core",
        "name": "逻辑完整性检查",
        "agent": "评审 Bot"
      },
      {
        "id": "n3",
        "lane": "core",
        "name": "人工审查：技术可行性",
        "agent": "用户审查",
        "type": "review",
        "review": {
          "questions": [
            {
              "id": "q1",
              "q": "积分自动扣减的风控冲突如何处理？",
              "options": [
                "调整风控规则，按原方案执行",
                "扣减改为次日批量执行",
                "本期不做积分扣减"
              ],
              "answer": null
            },
            {
              "id": "q2",
              "q": "会员等级同步延迟是否可接受？",
              "options": [
                "可接受，按小时级同步",
                "需优化为准实时同步",
                "本期降级为手动同步"
              ],
              "answer": null
            }
          ]
        }
      },
      {
        "id": "n4",
        "lane": "output",
        "name": "输出评审意见",
        "agent": "报告 Bot"
      }
    ]
  },
  {
    "id": "wf-content",
    "name": "多平台内容分发",
    "category": "内容生成",
    "desc": "一篇源稿适配公众号 / 知乎 / X 三个平台并排期",
    "edges": [
      [
        "n1",
        "n2"
      ],
      [
        "n1",
        "n3"
      ],
      [
        "n1",
        "n4"
      ],
      [
        "n2",
        "n5"
      ],
      [
        "n3",
        "n5"
      ],
      [
        "n4",
        "n5"
      ]
    ],
    "nodes": [
      {
        "id": "n1",
        "lane": "input",
        "name": "接收源稿",
        "agent": "内容助理 Bot"
      },
      {
        "id": "n2",
        "lane": "core",
        "name": "公众号版改写",
        "agent": "写作 Bot"
      },
      {
        "id": "n3",
        "lane": "core",
        "name": "知乎版改写",
        "agent": "写作 Bot"
      },
      {
        "id": "n4",
        "lane": "core",
        "name": "X 短文版改写",
        "agent": "写作 Bot"
      },
      {
        "id": "n5",
        "lane": "output",
        "name": "排期与发布",
        "agent": "发布 Bot"
      }
    ]
  },
  {
    "id": "wf-user",
    "name": "用户反馈聚类",
    "category": "研究分析",
    "desc": "拉取多渠道用户反馈，聚类并生成主题报告",
    "edges": [
      [
        "n1",
        "n2"
      ],
      [
        "n1",
        "n3"
      ],
      [
        "n2",
        "n4"
      ],
      [
        "n3",
        "n4"
      ]
    ],
    "nodes": [
      {
        "id": "n1",
        "lane": "input",
        "name": "拉取反馈数据",
        "agent": "数据采集 Bot"
      },
      {
        "id": "n2",
        "lane": "core",
        "name": "语义聚类",
        "agent": "分析 Bot"
      },
      {
        "id": "n3",
        "lane": "core",
        "name": "情感打分",
        "agent": "分析 Bot"
      },
      {
        "id": "n4",
        "lane": "output",
        "name": "生成主题报告",
        "agent": "报告 Bot"
      }
    ]
  },
  {
    "id": "wf-release",
    "name": "版本发布检查单",
    "category": "流程编排",
    "desc": "发布前自动核对检查单并汇总风险",
    "edges": [
      [
        "n1",
        "n2"
      ],
      [
        "n1",
        "n3"
      ],
      [
        "n2",
        "n4"
      ],
      [
        "n3",
        "n4"
      ]
    ],
    "nodes": [
      {
        "id": "n1",
        "lane": "input",
        "name": "读取发布单",
        "agent": "文档解析 Bot"
      },
      {
        "id": "n2",
        "lane": "core",
        "name": "核对回归范围",
        "agent": "QA Bot"
      },
      {
        "id": "n3",
        "lane": "core",
        "name": "扫描配置差异",
        "agent": "QA Bot"
      },
      {
        "id": "n4",
        "lane": "output",
        "name": "汇总发布风险",
        "agent": "报告 Bot"
      }
    ]
  },
  {
    "id": "wf-design",
    "name": "设计稿走查摘要",
    "category": "内容生成",
    "desc": "对照设计规范走查界面截图，输出问题摘要",
    "edges": [
      [
        "n1",
        "n2"
      ],
      [
        "n1",
        "n3"
      ],
      [
        "n2",
        "n4"
      ],
      [
        "n3",
        "n4"
      ]
    ],
    "nodes": [
      {
        "id": "n1",
        "lane": "input",
        "name": "接收走查截图",
        "agent": "内容助理 Bot"
      },
      {
        "id": "n2",
        "lane": "core",
        "name": "规范符合性比对",
        "agent": "走查 Bot"
      },
      {
        "id": "n3",
        "lane": "core",
        "name": "人工审查：问题定级",
        "agent": "用户审查",
        "type": "review",
        "review": {
          "questions": [
            {
              "id": "q1",
              "q": "两个问题的 P1 定级是否成立？",
              "options": [
                "均成立，按 P1 处理",
                "仅字号问题成立，对比度降 P2",
                "均降级为 P2 观察"
              ],
              "answer": null
            }
          ]
        }
      },
      {
        "id": "n4",
        "lane": "output",
        "name": "输出走查报告",
        "agent": "报告 Bot"
      }
    ]
  }
]

export const getWorkflow = (id) => workflows.find((w) => w.id === id)

// 无显式连线时按数组顺序链式兜底
export const chainEdges = (nodes) => {
  const out = []
  for (let i = 0; i < nodes.length - 1; i++) out.push([nodes[i].id, nodes[i + 1].id])
  return out
}

// 任务画布连线的统一解析：显式连线 → 绑定 Workflow 的连线 → 链式兜底（画布渲染与执行共用，防两处漂移）
export const taskEdges = (task) =>
  task.edges || getWorkflow(task.workflowId)?.edges || chainEdges(task.board || [])
