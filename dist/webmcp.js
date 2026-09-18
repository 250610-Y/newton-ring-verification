const context = document.modelContext;

function click(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`页面控件不存在: ${selector}`);
  element.click();
}

function setValue(selector, value, eventName = "input") {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`页面控件不存在: ${selector}`);
  element.value = String(value);
  element.dispatchEvent(new Event(eventName, { bubbles: true }));
}

if (context?.registerTool) {
  const tools = [
    {
      name: "open_verification_module",
      title: "打开实验模块",
      description: "切换到单张核验、缺陷平整度或班级统计模块。",
      inputSchema: { type: "object", properties: { module: { type: "string", enum: ["single", "defect", "batch"] } }, required: ["module"], additionalProperties: false },
      execute(input) {
        if (!["single", "defect", "batch"].includes(input?.module)) throw new Error("不支持的模块");
        click(`[data-view="${input.module}"]`);
        return { activeModule: input.module };
      },
    },
    {
      name: "run_radius_verification",
      title: "运行曲率核验",
      description: "填写学生曲率半径并触发页面中的四阶段原型核验。",
      inputSchema: { type: "object", properties: { studentRadius: { type: "number", exclusiveMinimum: 0 } }, required: ["studentRadius"], additionalProperties: false },
      async execute(input) {
        if (!Number.isFinite(input?.studentRadius) || input.studentRadius <= 0) throw new Error("曲率半径必须大于 0");
        click('[data-view="single"]');
        setValue("#student-radius", input.studentRadius);
        click("#run-analysis");
        await new Promise((resolve) => setTimeout(resolve, 1550));
        return { sampleId: "NR-024", studentRadius: input.studentRadius, result: document.querySelector("#result-label")?.textContent };
      },
    },
    {
      name: "filter_class_records",
      title: "筛选班级记录",
      description: "按学生编号和核验类别筛选班级明细表。",
      inputSchema: { type: "object", properties: { query: { type: "string" }, status: { type: "string", enum: ["all", "qualified", "operation-error", "review"] } }, additionalProperties: false },
      execute(input) {
        const status = input?.status ?? "all";
        if (!["all", "qualified", "operation-error", "review"].includes(status)) throw new Error("不支持的核验类别");
        click('[data-view="batch"]');
        setValue("#record-search", input?.query ?? "");
        setValue("#status-filter", status, "change");
        return { visibleRecords: document.querySelectorAll("#records-body tr").length, status, query: input?.query ?? "" };
      },
    },
  ];
  for (const tool of tools) {
    try {
      void Promise.resolve(context.registerTool({ ...tool, annotations: { readOnlyHint: false, untrustedContentHint: false } })).catch(() => {});
    } catch {}
  }
}
