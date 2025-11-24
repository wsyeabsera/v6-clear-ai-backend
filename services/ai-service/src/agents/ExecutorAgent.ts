import { v4 as uuidv4 } from 'uuid';
import { Plan, PlanStep, Execution, ExecutionStep } from '../types';
import { KernelAdapter } from '../kernel/KernelAdapter';

export interface ExecutorAgentOptions {
  plan: Plan;
  kernelAdapter: KernelAdapter;
}

export class ExecutorAgent {
  async executePlan(options: ExecutorAgentOptions): Promise<Execution> {
    const { plan, kernelAdapter } = options;
    const startedAt = new Date().toISOString();

    const execution: Execution = {
      id: uuidv4(),
      plan,
      status: 'running',
      steps: plan.steps.map(step => ({
        planStepId: step.id,
        status: 'pending',
      })),
      startedAt,
    };

    try {
      // Execute steps in order, respecting dependencies
      const completedSteps = new Set<string>();
      
      while (execution.steps.some(s => s.status === 'pending')) {
        // Find steps that are ready to execute (dependencies satisfied)
        const readySteps = execution.steps.filter(step => {
          if (step.status !== 'pending') return false;
          
          const planStep = plan.steps.find(ps => ps.id === step.planStepId);
          if (!planStep) return false;

          // Check if all dependencies are completed
          const allDepsCompleted = planStep.dependencies.every(depOrder => {
            const depStep = plan.steps.find(ps => ps.order === depOrder);
            if (!depStep) return true; // Dependency doesn't exist, consider it satisfied
            return completedSteps.has(depStep.id);
          });

          return allDepsCompleted;
        });

        if (readySteps.length === 0) {
          // No ready steps but still have pending - circular dependency or missing step
          const pendingSteps = execution.steps.filter(s => s.status === 'pending');
          for (const step of pendingSteps) {
            step.status = 'failed';
            step.error = 'Cannot execute: dependencies not satisfied';
          }
          break;
        }

        // Execute ready steps (can execute in parallel, but for now sequential)
        for (const step of readySteps) {
          const planStep = plan.steps.find(ps => ps.id === step.planStepId);
          if (!planStep) {
            step.status = 'failed';
            step.error = 'Plan step not found';
            continue;
          }

          step.status = 'running';
          step.startedAt = new Date().toISOString();

          try {
            // Execute the step
            const result = await this.executeStep(planStep, kernelAdapter);
            
            step.status = 'completed';
            step.result = result;
            step.completedAt = new Date().toISOString();
            completedSteps.add(planStep.id);

            // Emit progress event
            await kernelAdapter.eventBus.emit('ai-service.agent.executor.step.progress', {
              stepId: planStep.id,
              stepOrder: planStep.order,
              status: 'completed',
              result,
            }, {
              sessionId: execution.plan.id, // Use plan ID as session ID for now
            });
          } catch (stepError: any) {
            step.status = 'failed';
            step.error = stepError?.message || String(stepError);
            step.completedAt = new Date().toISOString();

            // Emit error event
            await kernelAdapter.eventBus.emit('ai-service.agent.executor.step.progress', {
              stepId: planStep.id,
              stepOrder: planStep.order,
              status: 'failed',
              error: step.error,
            }, {
              sessionId: execution.plan.id,
            });
          }
        }
      }

      // Determine final status
      const hasFailures = execution.steps.some(s => s.status === 'failed');
      const allCompleted = execution.steps.every(s => s.status === 'completed' || s.status === 'skipped');

      if (hasFailures && !allCompleted) {
        execution.status = 'failed';
        execution.error = 'One or more steps failed';
      } else if (allCompleted) {
        execution.status = 'completed';
        execution.results = {
          steps: execution.steps.map(s => ({
            stepId: s.planStepId,
            status: s.status,
            result: s.result,
          })),
        };
      }

      execution.completedAt = new Date().toISOString();
      return execution;
    } catch (error: any) {
      execution.status = 'failed';
      execution.error = error?.message || String(error);
      execution.completedAt = new Date().toISOString();
      return execution;
    }
  }

  private async executeStep(step: PlanStep, kernelAdapter: KernelAdapter): Promise<any> {
    // If step has a tool, execute it
    if (step.tool) {
      try {
        const toolRegistry = kernelAdapter.toolRegistry;
        if (!toolRegistry) {
          throw new Error('Tool registry not available');
        }

        // Validate tool parameters
        const validation = await toolRegistry.validateTool(step.tool, step.parameters || {});
        if (!validation.valid) {
          throw new Error(`Tool validation failed: ${validation.errors?.join(', ')}`);
        }

        // Execute tool
        const result = await toolRegistry.executeTool(step.tool, step.parameters || {});
        return result;
      } catch (toolError: any) {
        throw new Error(`Tool execution failed: ${toolError?.message || String(toolError)}`);
      }
    }

    // If no tool, this is a manual step - return the description
    return {
      type: 'manual',
      description: step.description,
      note: 'This step requires manual execution',
    };
  }
}

