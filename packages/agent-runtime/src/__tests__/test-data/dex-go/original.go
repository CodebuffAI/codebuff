package dex

import "fmt"

type Dex struct {
    name string
}

func (d *Dex) Handle(event string) error {
    if event == "" {
        return fmt.Errorf("missing event")
    }
    fmt.Println("event:", event)
    return nil
}

func (d *Dex) Version() string {
    return "v1"
}
