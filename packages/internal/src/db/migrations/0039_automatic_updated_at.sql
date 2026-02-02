-- Create a reusable function that sets updated_at to NOW()
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Add trigger to subscription table
CREATE TRIGGER trigger_subscription_updated_at
  BEFORE UPDATE ON "subscription"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

--> statement-breakpoint

-- Add trigger to limit_override table
CREATE TRIGGER trigger_limit_override_updated_at
  BEFORE UPDATE ON "limit_override"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
