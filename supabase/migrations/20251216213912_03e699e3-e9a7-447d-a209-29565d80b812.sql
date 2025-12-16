-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('success', 'warning', 'info', 'error')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  case_id UUID REFERENCES public.clinical_cases(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only view their own notifications
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete their own notifications"
ON public.notifications
FOR DELETE
USING (auth.uid() = user_id);

-- System can insert notifications (via service role or triggers)
CREATE POLICY "System can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(user_id, read);

-- Function to create notification when facial analysis completes
CREATE OR REPLACE FUNCTION public.notify_analysis_complete()
RETURNS TRIGGER AS $$
BEGIN
  -- When status changes to 'completed' or 'success'
  IF NEW.status IN ('completed', 'success') AND (OLD.status IS NULL OR OLD.status NOT IN ('completed', 'success')) THEN
    INSERT INTO public.notifications (user_id, type, title, message, case_id)
    SELECT 
      cc.responsible_id,
      'success',
      'Análise concluída',
      'A análise facial do caso foi processada com sucesso',
      NEW.case_id::uuid
    FROM public.clinical_cases cc
    WHERE cc.id = NEW.case_id::uuid
    AND cc.responsible_id IS NOT NULL;
  END IF;
  
  -- When status changes to 'failed'
  IF NEW.status = 'failed' AND (OLD.status IS NULL OR OLD.status != 'failed') THEN
    INSERT INTO public.notifications (user_id, type, title, message, case_id)
    SELECT 
      cc.responsible_id,
      'error',
      'Erro na análise',
      COALESCE(NEW.error_message, 'A análise facial falhou. Tente novamente.'),
      NEW.case_id::uuid
    FROM public.clinical_cases cc
    WHERE cc.id = NEW.case_id::uuid
    AND cc.responsible_id IS NOT NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for facial_analysis_jobs
CREATE TRIGGER on_analysis_job_status_change
  AFTER UPDATE ON public.facial_analysis_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_analysis_complete();