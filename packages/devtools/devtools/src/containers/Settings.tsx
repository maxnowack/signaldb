import React from 'react'
import styled from 'styled-components'
import colors from '../colorPalette'
import settingsStore from '../models/settingsStore'

const Wrapper = styled.div`
  color: ${colors.white};
  padding: 16px;
  font-size: 14px;
  font-weight: 400;
  label {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    input, select {
      margin-right: 8px;
    }
  }
`

const Settings: React.FC = () => {
  const settings = settingsStore.use()

  return (
    <Wrapper>
      <label>
        <input
          type="checkbox"
          checked={settings.showButton}
          onChange={event => settingsStore.patch({ showButton: event.target.checked })}
        />
        Show Button for opening devtools (You can always use Ctrl+Shift+S)
      </label>
      <label>
        <select
          value={settings.badgeType}
          onChange={event => settingsStore.patch({ badgeType: event.target.value })}
          disabled={!settings.showButton}
        >
          <option value="disabled">Disable badge</option>
          <option value="collections">Collection count</option>
          <option value="queries">Query count</option>
        </select>
        Badge type
      </label>
    </Wrapper>
  )
}

export default Settings
