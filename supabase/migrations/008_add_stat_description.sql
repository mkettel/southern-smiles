-- Add description field to stats for defining what the stat means and how to calculate it
ALTER TABLE stats ADD COLUMN description text;
