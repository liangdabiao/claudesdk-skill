// Research Agent Example
// 基于 research-agent 项目的多代理研究系统示例

import { query } from '@anthropic-ai/claude-agent-sdk';
import * as path from 'path';

// 研究代理配置
const RESEARCH_AGENT_CONFIG = {
  description: "A research specialist that gathers information on specific topics using web search",
  prompt: `You are a research specialist. Your job is to gather comprehensive information on a given topic.
- Use WebSearch to find relevant information
- Use WebFetch to read detailed articles
- Save your findings to files with clear, descriptive names
- Focus on authoritative sources
- Include source URLs for all information`,
  tools: ["WebSearch", "WebFetch", "Read", "Write", "TodoWrite"]
};

// 报告撰写代理配置
const REPORT_WRITER_CONFIG = {
  description: "Writes comprehensive reports based on research findings",
  prompt: `You are a report writer. Your job is to synthesize research findings into a well-structured report.
- Organize information logically
- Include citations and source URLs
- Create a professional, easy-to-read format
- Save reports to files/reports/ directory`,
  tools: ["Read", "Write", "Glob"]
};

// 主研究代理函数
export async function runResearchAgent(topic: string) {
  console.log(`Starting research on: ${topic}`);
  
  // 步骤1: 分解主题为子主题
  const subTopics = await breakDownTopic(topic);
  console.log('Identified subtopics:', subTopics);
  
  // 步骤2: 并行研究每个子主题
  const researchResults = await Promise.all(
    subTopics.map(subTopic => researchSubTopic(subTopic))
  );
  
  // 步骤3: 合成研究结果
  const finalReport = await synthesizeReport(topic, researchResults);
  
  console.log('Research complete! Report generated.');
  return finalReport;
}

// 分解主题为子主题
async function breakDownTopic(topic: string): Promise<string[]> {
  const result = await query({
    prompt: `Break down the research topic "${topic}" into 3-5 key subtopics that need investigation.
Return only the subtopics as a JSON array, no other text.`,
    options: {
      model: 'sonnet',
      maxTurns: 1,
      outputFormat: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            subtopics: { type: 'array', items: { type: 'string' } }
          },
          required: ['subtopics']
        }
      }
    }
  });
  
  for await (const message of result) {
    if (message.type === 'result' && message.subtype === 'success') {
      try {
        const parsed = JSON.parse(message.result);
        return parsed.subtopics;
      } catch (e) {
        console.error('Failed to parse subtopics:', e);
      }
    }
  }
  
  return ['General information'];
}

// 研究单个子主题
async function researchSubTopic(subTopic: string): Promise<string> {
  console.log(`Researching: ${subTopic}`);
  
  const result = await query({
    prompt: `Research the subtopic: "${subTopic}".
1. Use WebSearch to find relevant information
2. Use WebFetch to read key sources
3. Summarize your findings with citations`,
    options: {
      model: 'sonnet',
      maxTurns: 20,
      cwd: path.join(process.cwd(), 'agent'),
      agents: {
        researcher: RESEARCH_AGENT_CONFIG
      },
      allowedTools: ['Task', 'WebSearch', 'WebFetch', 'Read', 'Write']
    }
  });
  
  let findings = '';
  for await (const message of result) {
    if (message.type === 'result' && message.subtype === 'success') {
      findings = message.result;
    }
  }
  
  return findings;
}

// 合成研究结果为报告
async function synthesizeReport(topic: string, findings: string[]): Promise<string> {
  console.log('Synthesizing report...');
  
  const result = await query({
    prompt: `Write a comprehensive research report on "${topic}" using these findings:

${findings.map((f, i) => `## Finding ${i+1}\n${f}`).join('\n\n')}

Structure the report with:
1. Executive Summary
2. Introduction
3. Key Findings
4. Conclusion
5. References`,
    options: {
      model: 'opus',
      maxTurns: 10,
      agents: {
        'report-writer': REPORT_WRITER_CONFIG
      },
      allowedTools: ['Task', 'Read', 'Write']
    }
  });
  
  let report = '';
  for await (const message of result) {
    if (message.type === 'result' && message.subtype === 'success') {
      report = message.result;
    }
  }
  
  return report;
}

// 使用示例
if (require.main === module) {
  const topic = process.argv[2] || 'Artificial Intelligence trends in 2025';
  runResearchAgent(topic)
    .then(report => console.log('\nFinal Report:\n', report))
    .catch(console.error);
}
