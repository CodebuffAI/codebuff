func (d *Dex) Handle(event string) error {
    event = strings.TrimSpace(event)
    if event == "" {
        return fmt.Errorf("missing event")
    }
    fmt.Println("event:", event)
    return nil
}
