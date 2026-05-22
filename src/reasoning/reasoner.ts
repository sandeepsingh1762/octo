import type { 
  ThinkingChunk, 
  ThinkingCategory, 
  Conclusion, 
  ActionPlan, 
  PlanStep,
  ReasoningSession,
  ReasoningConfig,
  ReasoningResult,
  RiskLevel,
  DEFAULT_REASONING_CONFIG
} from "./types.js";

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class Reasoner {
  private session: ReasoningSession | null = null;
  private config: ReasoningConfig;
  private onThinking?: (thought: ThinkingChunk) => void;
  private onConclusion?: (conclusion: Conclusion) => void;

  constructor(config?: Partial<ReasoningConfig>) {
    this.config = {
      maxThinkingDepth: config?.maxThinkingDepth ?? 3,
      maxThinkingTokens: config?.maxThinkingTokens ?? 10000,
      minConfidence: config?.minConfidence ?? 0.6,
      enableParallelThinking: config?.enableParallelThinking ?? true,
      thinkingCategories: config?.thinkingCategories ?? ['analysis', 'planning', 'evaluation', 'reflection', 'verification'],
      showThinkingToUser: config?.showThinkingToUser ?? true,
      autoReplan: config?.autoReplan ?? true,
    };
  }

  setThinkingCallback(cb: (thought: ThinkingChunk) => void): void {
    this.onThinking = cb;
  }

  setConclusionCallback(cb: (conclusion: Conclusion) => void): void {
    this.onConclusion = cb;
  }

  async reason(goal: string, context: string): Promise<ReasoningResult> {
    // Initialize session
    this.session = {
      id: generateId(),
      goal,
      context,
      thoughts: [],
      conclusions: [],
      confidence: 0,
      startedAt: new Date(),
      tokensUsed: 0,
    };

    try {
      // 1. Analyze the goal
      const analysis = await this.analyze(goal, context);
      
      // 2. Generate hypotheses
      const hypotheses = await this.generateHypotheses(analysis);
      
      // 3. Evaluate each hypothesis
      const evaluations = await this.evaluateHypotheses(hypotheses);
      
      // 4. Select best approach
      const selectedApproach = this.selectBestApproach(evaluations);
      
      // 5. Create detailed plan
      const plan = await this.createPlan(selectedApproach, goal, context);
      
      // 6. Verify plan
      const verified = await this.verifyPlan(plan);

      this.session.plan = verified;
      this.session.confidence = this.calculateOverallConfidence();
      this.session.completedAt = new Date();

      return {
        success: true,
        plan: verified,
        thoughts: this.session.thoughts,
        conclusions: this.session.conclusions,
        confidence: this.session.confidence,
        tokensUsed: this.session.tokensUsed,
      };
    } catch (error) {
      return {
        success: false,
        thoughts: this.session?.thoughts || [],
        conclusions: this.session?.conclusions || [],
        confidence: 0,
        tokensUsed: this.session?.tokensUsed || 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private addThought(
    content: string, 
    category: ThinkingCategory, 
    confidence: number,
    depth = 0,
    parentId?: string
  ): ThinkingChunk {
    const thought: ThinkingChunk = {
      id: generateId(),
      type: 'thinking',
      content,
      category,
      depth,
      confidence,
      timestamp: Date.now(),
      parentId,
    };

    this.session!.thoughts.push(thought);
    this.session!.tokensUsed += this.estimateTokens(content);

    if (this.onThinking) {
      this.onThinking(thought);
    }

    return thought;
  }

  private addConclusion(summary: string, confidence: number, supportingThoughts: string[], alternatives?: string[]): Conclusion {
    const conclusion: Conclusion = {
      id: generateId(),
      summary,
      confidence,
      supportingThoughts,
      alternatives,
      timestamp: Date.now(),
    };

    this.session!.conclusions.push(conclusion);

    if (this.onConclusion) {
      this.onConclusion(conclusion);
    }

    return conclusion;
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  private async analyze(goal: string, context: string): Promise<{
    complexity: 'simple' | 'moderate' | 'complex';
    components: string[];
    requirements: string[];
    constraints: string[];
    risks: string[];
  }> {
    this.addThought(
      `Analyzing goal: "${goal}"\nContext available: ${context.length} characters`,
      'analysis',
      0.9
    );

    // Break down the goal into components
    const components = this.extractComponents(goal);
    this.addThought(
      `Identified ${components.length} main components:\n${components.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
      'decomposition',
      0.85,
      1
    );

    // Identify requirements
    const requirements = this.extractRequirements(goal, context);
    this.addThought(
      `Requirements identified:\n${requirements.map(r => `- ${r}`).join('\n')}`,
      'analysis',
      0.8,
      1
    );

    // Identify constraints
    const constraints = this.extractConstraints(context);
    if (constraints.length > 0) {
      this.addThought(
        `Constraints to consider:\n${constraints.map(c => `- ${c}`).join('\n')}`,
        'analysis',
        0.75,
        1
      );
    }

    // Identify risks
    const risks = this.identifyRisks(goal, components);
    if (risks.length > 0) {
      this.addThought(
        `Potential risks:\n${risks.map(r => `- ${r}`).join('\n')}`,
        'evaluation',
        0.7,
        1
      );
    }

    const complexity = this.assessComplexity(components, requirements, constraints);
    this.addThought(
      `Overall complexity assessment: ${complexity}`,
      'evaluation',
      0.85
    );

    return { complexity, components, requirements, constraints, risks };
  }

  private extractComponents(goal: string): string[] {
    const components: string[] = [];
    
    // Look for action verbs
    const actionPatterns = [
      /create\s+(?:a\s+)?(\w+(?:\s+\w+)?)/gi,
      /implement\s+(?:a\s+)?(\w+(?:\s+\w+)?)/gi,
      /add\s+(?:a\s+)?(\w+(?:\s+\w+)?)/gi,
      /build\s+(?:a\s+)?(\w+(?:\s+\w+)?)/gi,
      /fix\s+(?:the\s+)?(\w+(?:\s+\w+)?)/gi,
      /update\s+(?:the\s+)?(\w+(?:\s+\w+)?)/gi,
      /refactor\s+(?:the\s+)?(\w+(?:\s+\w+)?)/gi,
    ];

    for (const pattern of actionPatterns) {
      let match;
      while ((match = pattern.exec(goal)) !== null) {
        components.push(match[0].trim());
      }
    }

    // If no patterns found, split by conjunctions
    if (components.length === 0) {
      const parts = goal.split(/\s+(?:and|,|then|also)\s+/i);
      components.push(...parts.map(p => p.trim()).filter(p => p.length > 3));
    }

    return [...new Set(components)]; // Remove duplicates
  }

  private extractRequirements(goal: string, context: string): string[] {
    const requirements: string[] = [];
    
    // Extract from goal
    const requirementPatterns = [
      /must\s+([^,.]+)/gi,
      /should\s+([^,.]+)/gi,
      /need(?:s)?\s+to\s+([^,.]+)/gi,
      /has\s+to\s+([^,.]+)/gi,
    ];

    for (const pattern of requirementPatterns) {
      let match;
      while ((match = pattern.exec(goal)) !== null) {
        requirements.push(match[1].trim());
      }
    }

    // Look for implicit requirements in context
    if (context.includes('typescript') || context.includes('.ts')) {
      requirements.push('TypeScript compatibility');
    }
    if (context.includes('test') || context.includes('spec')) {
      requirements.push('Test coverage');
    }
    if (context.includes('api') || context.includes('endpoint')) {
      requirements.push('API design considerations');
    }

    return requirements.length > 0 ? requirements : ['Complete the task as specified'];
  }

  private extractConstraints(context: string): string[] {
    const constraints: string[] = [];

    // Technical constraints
    if (context.includes('no external')) {
      constraints.push('No external dependencies');
    }
    if (context.includes('backwards compatible')) {
      constraints.push('Backwards compatibility required');
    }
    if (context.includes('performance')) {
      constraints.push('Performance considerations');
    }

    return constraints;
  }

  private identifyRisks(goal: string, components: string[]): string[] {
    const risks: string[] = [];

    // Common risk patterns
    if (goal.toLowerCase().includes('delete') || goal.toLowerCase().includes('remove')) {
      risks.push('Data loss risk - ensure backups or reversibility');
    }
    if (goal.toLowerCase().includes('refactor') || goal.toLowerCase().includes('rewrite')) {
      risks.push('Breaking changes - need comprehensive testing');
    }
    if (goal.toLowerCase().includes('security') || goal.toLowerCase().includes('auth')) {
      risks.push('Security implications - require careful review');
    }
    if (components.length > 5) {
      risks.push('Complex task - consider breaking into smaller parts');
    }

    return risks;
  }

  private assessComplexity(
    components: string[], 
    requirements: string[], 
    constraints: string[]
  ): 'simple' | 'moderate' | 'complex' {
    const score = components.length + requirements.length * 0.5 + constraints.length * 0.3;
    
    if (score < 3) return 'simple';
    if (score < 7) return 'moderate';
    return 'complex';
  }

  private async generateHypotheses(analysis: {
    complexity: string;
    components: string[];
    requirements: string[];
    constraints: string[];
    risks: string[];
  }): Promise<Array<{ approach: string; pros: string[]; cons: string[]; confidence: number }>> {
    this.addThought('Generating possible approaches...', 'hypothesis', 0.8);

    const hypotheses: Array<{ approach: string; pros: string[]; cons: string[]; confidence: number }> = [];

    // Generate multiple approaches based on complexity
    if (analysis.complexity === 'simple') {
      hypotheses.push({
        approach: 'Direct implementation',
        pros: ['Quick to implement', 'Minimal overhead'],
        cons: ['May miss edge cases'],
        confidence: 0.85,
      });
    } else {
      // Multiple approaches for complex tasks
      hypotheses.push({
        approach: 'Step-by-step incremental approach',
        pros: ['Easier to debug', 'Can verify at each step', 'Safer'],
        cons: ['May take longer', 'More intermediate states'],
        confidence: 0.8,
      });

      hypotheses.push({
        approach: 'Parallel implementation of independent components',
        pros: ['Faster overall', 'Natural separation of concerns'],
        cons: ['Harder to coordinate', 'Integration challenges'],
        confidence: 0.75,
      });

      if (analysis.risks.length > 0) {
        hypotheses.push({
          approach: 'Risk-first approach - address risks before features',
          pros: ['Reduces overall risk', 'Early problem detection'],
          cons: ['May delay visible progress'],
          confidence: 0.7,
        });
      }
    }

    // Log hypotheses
    for (const h of hypotheses) {
      this.addThought(
        `Hypothesis: ${h.approach}\n  Pros: ${h.pros.join(', ')}\n  Cons: ${h.cons.join(', ')}\n  Initial confidence: ${h.confidence}`,
        'hypothesis',
        h.confidence,
        1
      );
    }

    return hypotheses;
  }

  private async evaluateHypotheses(
    hypotheses: Array<{ approach: string; pros: string[]; cons: string[]; confidence: number }>
  ): Promise<Array<{ approach: string; score: number; reasoning: string }>> {
    this.addThought('Evaluating approaches...', 'evaluation', 0.85);

    const evaluations = hypotheses.map(h => {
      // Score based on pros/cons ratio and base confidence
      const prosScore = h.pros.length * 0.2;
      const consScore = h.cons.length * 0.15;
      const score = h.confidence + prosScore - consScore;

      const reasoning = `${h.approach}: Base confidence ${h.confidence}, ` +
        `+${prosScore.toFixed(2)} from ${h.pros.length} pros, ` +
        `-${consScore.toFixed(2)} from ${h.cons.length} cons = ${score.toFixed(2)}`;

      this.addThought(reasoning, 'evaluation', score, 1);

      return { approach: h.approach, score, reasoning };
    });

    // Sort by score descending
    evaluations.sort((a, b) => b.score - a.score);

    return evaluations;
  }

  private selectBestApproach(
    evaluations: Array<{ approach: string; score: number; reasoning: string }>
  ): { approach: string; score: number } {
    const best = evaluations[0];
    
    this.addThought(
      `Selected approach: "${best.approach}" with score ${best.score.toFixed(2)}`,
      'decision',
      best.score
    );

    this.addConclusion(
      `Best approach: ${best.approach}`,
      best.score,
      this.session!.thoughts.filter(t => t.category === 'evaluation').map(t => t.id),
      evaluations.slice(1).map(e => e.approach)
    );

    return best;
  }

  private async createPlan(
    selectedApproach: { approach: string; score: number },
    goal: string,
    context: string
  ): Promise<ActionPlan> {
    this.addThought(`Creating detailed plan using "${selectedApproach.approach}"...`, 'planning', 0.9);

    const steps: PlanStep[] = [];
    const dependencies = new Map<string, string[]>();

    // Generate steps based on approach
    if (selectedApproach.approach.includes('incremental') || selectedApproach.approach.includes('step-by-step')) {
      // Sequential steps
      const stepDescriptions = this.generateSequentialSteps(goal, context);
      let prevStepId: string | null = null;

      for (const desc of stepDescriptions) {
        const step = this.createPlanStep(desc);
        if (prevStepId) {
          step.dependencies.push(prevStepId);
          dependencies.set(step.id, [prevStepId]);
        }
        steps.push(step);
        prevStepId = step.id;

        this.addThought(
          `Step ${steps.length}: ${step.description}\n  Tool: ${step.tool || 'agent'}\n  Risk: ${step.riskLevel}`,
          'planning',
          0.85,
          1
        );
      }
    } else if (selectedApproach.approach.includes('parallel')) {
      // Parallel steps where possible
      const stepDescriptions = this.generateParallelSteps(goal, context);
      for (const desc of stepDescriptions) {
        const step = this.createPlanStep(desc);
        steps.push(step);
        dependencies.set(step.id, []);
      }
    } else {
      // Default: analyze goal and create appropriate steps
      const stepDescriptions = this.generateDefaultSteps(goal, context);
      for (const desc of stepDescriptions) {
        const step = this.createPlanStep(desc);
        steps.push(step);
      }
    }

    // Calculate total estimated tokens
    const estimatedTokens = steps.reduce((sum, s) => sum + (s.estimatedTokens || 500), 0);

    // Assess overall risk
    const riskAssessment = this.assessPlanRisk(steps);

    const plan: ActionPlan = {
      id: generateId(),
      goal,
      steps,
      dependencies,
      estimatedTokens,
      riskAssessment,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.addThought(
      `Plan created with ${steps.length} steps, estimated ${estimatedTokens} tokens, overall risk: ${riskAssessment}`,
      'planning',
      0.9
    );

    return plan;
  }

  private generateSequentialSteps(goal: string, context: string): string[] {
    const steps: string[] = [];
    
    // Common patterns for sequential work
    steps.push('Analyze current state and gather context');
    
    if (goal.toLowerCase().includes('create') || goal.toLowerCase().includes('implement')) {
      steps.push('Design the structure and interfaces');
      steps.push('Implement core functionality');
      steps.push('Add error handling and edge cases');
      steps.push('Write tests');
      steps.push('Verify and document');
    } else if (goal.toLowerCase().includes('fix') || goal.toLowerCase().includes('bug')) {
      steps.push('Reproduce and understand the issue');
      steps.push('Identify root cause');
      steps.push('Implement fix');
      steps.push('Verify fix resolves the issue');
      steps.push('Add regression test');
    } else if (goal.toLowerCase().includes('refactor')) {
      steps.push('Understand existing implementation');
      steps.push('Identify areas for improvement');
      steps.push('Apply refactoring incrementally');
      steps.push('Ensure tests pass after each change');
      steps.push('Update documentation');
    } else {
      // Generic steps
      steps.push('Break down the task');
      steps.push('Execute main work');
      steps.push('Verify results');
      steps.push('Clean up and finalize');
    }

    return steps;
  }

  private generateParallelSteps(goal: string, context: string): string[] {
    // Identify independent components that can be worked on in parallel
    const steps: string[] = [];
    
    steps.push('Initial setup and context gathering');
    
    // These could potentially run in parallel
    const parallelTasks = this.extractComponents(goal);
    for (const task of parallelTasks.slice(0, 4)) {
      steps.push(`Work on: ${task}`);
    }
    
    steps.push('Integration and verification');
    
    return steps;
  }

  private generateDefaultSteps(goal: string, context: string): string[] {
    return [
      'Understand the goal and context',
      'Plan the approach',
      'Execute the main task',
      'Verify the results',
      'Clean up and finalize',
    ];
  }

  private createPlanStep(description: string): PlanStep {
    // Infer tool from description
    let tool: string | undefined;
    if (description.toLowerCase().includes('read') || description.toLowerCase().includes('analyze')) {
      tool = 'Read';
    } else if (description.toLowerCase().includes('write') || description.toLowerCase().includes('create')) {
      tool = 'Write';
    } else if (description.toLowerCase().includes('search') || description.toLowerCase().includes('find')) {
      tool = 'Grep';
    } else if (description.toLowerCase().includes('test')) {
      tool = 'TestRun';
    } else if (description.toLowerCase().includes('run') || description.toLowerCase().includes('execute')) {
      tool = 'Bash';
    }

    // Assess risk level
    const riskLevel = this.assessStepRisk(description);

    return {
      id: generateId(),
      description,
      tool,
      expectedOutcome: `Successfully complete: ${description}`,
      dependencies: [],
      estimatedTokens: 500,
      riskLevel,
      status: 'pending',
    };
  }

  private assessStepRisk(description: string): RiskLevel {
    const lowerDesc = description.toLowerCase();
    
    if (lowerDesc.includes('delete') || lowerDesc.includes('remove') || lowerDesc.includes('drop')) {
      return 'high';
    }
    if (lowerDesc.includes('modify') || lowerDesc.includes('update') || lowerDesc.includes('change')) {
      return 'medium';
    }
    if (lowerDesc.includes('read') || lowerDesc.includes('analyze') || lowerDesc.includes('search')) {
      return 'low';
    }
    return 'medium';
  }

  private assessPlanRisk(steps: PlanStep[]): RiskLevel {
    const riskCounts = { low: 0, medium: 0, high: 0, critical: 0 };
    
    for (const step of steps) {
      riskCounts[step.riskLevel]++;
    }

    if (riskCounts.critical > 0) return 'critical';
    if (riskCounts.high > 2) return 'critical';
    if (riskCounts.high > 0) return 'high';
    if (riskCounts.medium > steps.length / 2) return 'medium';
    return 'low';
  }

  private async verifyPlan(plan: ActionPlan): Promise<ActionPlan> {
    this.addThought('Verifying plan...', 'verification', 0.9);

    // Check for circular dependencies
    const visited = new Set<string>();
    const inProgress = new Set<string>();
    
    const hasCycle = (stepId: string): boolean => {
      if (inProgress.has(stepId)) return true;
      if (visited.has(stepId)) return false;
      
      inProgress.add(stepId);
      const deps = plan.dependencies.get(stepId) || [];
      for (const dep of deps) {
        if (hasCycle(dep)) return true;
      }
      inProgress.delete(stepId);
      visited.add(stepId);
      return false;
    };

    for (const step of plan.steps) {
      if (hasCycle(step.id)) {
        this.addThought('Warning: Circular dependency detected in plan', 'verification', 0.5);
        // Remove the problematic dependency
        const deps = plan.dependencies.get(step.id) || [];
        plan.dependencies.set(step.id, deps.filter(d => !inProgress.has(d)));
      }
    }

    // Verify all steps have expected outcomes
    for (const step of plan.steps) {
      if (!step.expectedOutcome) {
        step.expectedOutcome = `Complete: ${step.description}`;
        this.addThought(`Added missing expected outcome for step: ${step.description}`, 'verification', 0.7, 1);
      }
    }

    this.addThought(
      `Plan verified: ${plan.steps.length} steps, ${plan.riskAssessment} overall risk`,
      'verification',
      0.9
    );

    this.addConclusion(
      `Plan ready for execution with ${plan.steps.length} steps`,
      0.9,
      this.session!.thoughts.filter(t => t.category === 'verification').map(t => t.id)
    );

    return plan;
  }

  private calculateOverallConfidence(): number {
    if (!this.session || this.session.thoughts.length === 0) return 0;

    // Weight recent thoughts more heavily
    const thoughts = this.session.thoughts;
    let weightedSum = 0;
    let weightSum = 0;

    for (let i = 0; i < thoughts.length; i++) {
      const weight = 1 + (i / thoughts.length); // Later thoughts weighted more
      weightedSum += thoughts[i].confidence * weight;
      weightSum += weight;
    }

    return weightedSum / weightSum;
  }

  // Methods for reflection and self-correction
  async reflect(result: { success: boolean; output: string }): Promise<{
    shouldReplan: boolean;
    insights: string[];
    adjustments: string[];
  }> {
    this.addThought(
      `Reflecting on result: ${result.success ? 'Success' : 'Failure'}\nOutput: ${result.output.slice(0, 500)}`,
      'reflection',
      result.success ? 0.9 : 0.5
    );

    const insights: string[] = [];
    const adjustments: string[] = [];

    if (!result.success) {
      insights.push('Step did not complete successfully');
      
      // Analyze failure
      if (result.output.toLowerCase().includes('error')) {
        insights.push('Error detected in output');
        adjustments.push('Consider adding error handling');
      }
      if (result.output.toLowerCase().includes('not found')) {
        insights.push('Resource not found');
        adjustments.push('Verify paths and resources exist');
      }
      if (result.output.toLowerCase().includes('permission')) {
        insights.push('Permission issue detected');
        adjustments.push('Check and request necessary permissions');
      }
    } else {
      insights.push('Step completed as expected');
    }

    const shouldReplan = !result.success && this.config.autoReplan;

    this.addConclusion(
      `Reflection: ${shouldReplan ? 'Replanning needed' : 'Continuing as planned'}`,
      result.success ? 0.9 : 0.6,
      this.session!.thoughts.filter(t => t.category === 'reflection').map(t => t.id)
    );

    return { shouldReplan, insights, adjustments };
  }

  getSession(): ReasoningSession | null {
    return this.session;
  }

  formatThoughts(): string {
    if (!this.session) return 'No reasoning session active.';

    const lines: string[] = ['=== Reasoning Process ===\n'];

    for (const thought of this.session.thoughts) {
      const indent = '  '.repeat(thought.depth);
      const icon = this.getCategoryIcon(thought.category);
      lines.push(`${indent}${icon} [${thought.category}] (${(thought.confidence * 100).toFixed(0)}%)`);
      lines.push(`${indent}   ${thought.content.replace(/\n/g, `\n${indent}   `)}`);
      lines.push('');
    }

    if (this.session.conclusions.length > 0) {
      lines.push('=== Conclusions ===\n');
      for (const conclusion of this.session.conclusions) {
        lines.push(`📍 ${conclusion.summary} (${(conclusion.confidence * 100).toFixed(0)}% confidence)`);
        if (conclusion.alternatives && conclusion.alternatives.length > 0) {
          lines.push(`   Alternatives considered: ${conclusion.alternatives.join(', ')}`);
        }
        lines.push('');
      }
    }

    if (this.session.plan) {
      lines.push('=== Plan ===\n');
      lines.push(`Goal: ${this.session.plan.goal}`);
      lines.push(`Risk Level: ${this.session.plan.riskAssessment}`);
      lines.push(`Estimated Tokens: ${this.session.plan.estimatedTokens}\n`);
      
      for (let i = 0; i < this.session.plan.steps.length; i++) {
        const step = this.session.plan.steps[i];
        const statusIcon = step.status === 'completed' ? '✓' : step.status === 'failed' ? '✗' : '○';
        lines.push(`${statusIcon} ${i + 1}. ${step.description}`);
        if (step.tool) lines.push(`      Tool: ${step.tool}`);
        lines.push(`      Risk: ${step.riskLevel}`);
      }
    }

    return lines.join('\n');
  }

  private getCategoryIcon(category: ThinkingCategory): string {
    const icons: Record<ThinkingCategory, string> = {
      analysis: '🔍',
      planning: '📋',
      evaluation: '⚖️',
      reflection: '🪞',
      synthesis: '🔗',
      hypothesis: '💡',
      verification: '✅',
      decision: '🎯',
      research: '📚',
      decomposition: '🧩',
    };
    return icons[category] || '💭';
  }
}

export default Reasoner;
